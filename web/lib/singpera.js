'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SINGPERA_BIN =
  process.env.SINGPERA_BIN ||
  (fs.existsSync('/usr/local/bin/singpera')
    ? '/usr/local/bin/singpera'
    : path.join(REPO_ROOT, 'singpera'));

const SINGPERA_HOME = process.env.SINGPERA_HOME || '/home/singpera';
const SSH_KEY = path.join(SINGPERA_HOME, '.ssh', 'singpera_key');
const STORAGE_FILE = path.join(SINGPERA_HOME, '.singpera_storage');
const REMOTE_DIR_FILE = path.join(SINGPERA_HOME, '.singpera_remote_dir');

const JOB_MARKER = '# singpera';

async function run(cmd, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: options.timeout || 10 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...options.env },
    });
    return {
      stdout: stdout || '',
      stderr: stderr || '',
    };
  } catch (err) {
    const wrapped = new Error(err.message || 'command failed');
    wrapped.status = 500;
    wrapped.stdout = err.stdout || '';
    wrapped.stderr = err.stderr || '';
    wrapped.code = err.code;
    throw wrapped;
  }
}

/**
 * Resolve path to singpera executable.
 */
function getSingperaPath() {
  return SINGPERA_BIN;
}

/**
 * One-shot backup via non-interactive CLI: singpera <SRC> <DEST>
 * DEST must be user@host:/path
 */
async function oneshotBackup(src, dest) {
  validateSrcDest(src, dest);
  const { stdout, stderr } = await run(SINGPERA_BIN, [src, dest], {
    timeout: 30 * 60 * 1000,
  });
  return { ok: true, stdout, stderr };
}

/**
 * Scheduled backup via CLI: singpera -c "<CRON>" <SRC> <DEST>
 */
async function scheduleBackup(cron, src, dest) {
  validateSrcDest(src, dest);
  validateCron(cron);
  const { stdout, stderr } = await run(SINGPERA_BIN, ['-c', cron, src, dest], {
    timeout: 60 * 1000,
  });
  return { ok: true, stdout, stderr };
}

/**
 * List root crontab lines related to singpera / rsync backups.
 */
async function listJobs() {
  let stdout = '';
  try {
    const result = await run('crontab', ['-u', 'root', '-l'], { timeout: 15 * 1000 });
    stdout = result.stdout;
  } catch (err) {
    // crontab exits 1 when empty
    if (err.code === 1 || /no crontab/i.test(err.stderr || '')) {
      return [];
    }
    // Non-root may need sudo
    try {
      const result = await run('sudo', ['crontab', '-u', 'root', '-l'], {
        timeout: 15 * 1000,
      });
      stdout = result.stdout;
    } catch (err2) {
      if (err2.code === 1 || /no crontab/i.test(err2.stderr || '')) {
        return [];
      }
      throw err2;
    }
  }

  return parseCrontab(stdout);
}

function parseCrontab(text) {
  const lines = text.split(/\r?\n/);
  const jobs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const isSingpera =
      line.includes('singpera') ||
      line.includes('singpera_key') ||
      (line.includes('rsync') && line.includes(SINGPERA_HOME));

    const prev = i > 0 ? lines[i - 1].trim() : '';
    const marked = prev.includes(JOB_MARKER) || line.includes(JOB_MARKER);

    if (!isSingpera && !marked) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    const cron = parts.slice(0, 5).join(' ');
    const command = parts.slice(5).join(' ');

    jobs.push({
      cron,
      command,
      raw: line,
      marked: marked || line.includes(JOB_MARKER),
    });
  }

  return jobs;
}

/**
 * Config / readiness status based on files under /home/singpera.
 */
async function configStatus() {
  const readMaybe = (file) => {
    try {
      return fs.readFileSync(file, 'utf8').trim();
    } catch {
      return null;
    }
  };

  const storage = readMaybe(STORAGE_FILE);
  const remoteDir = readMaybe(REMOTE_DIR_FILE);
  const sshKeyExists = fs.existsSync(SSH_KEY);
  const sshPubExists = fs.existsSync(`${SSH_KEY}.pub`);
  const homeExists = fs.existsSync(SINGPERA_HOME);

  return {
    configured: Boolean(storage && remoteDir && sshKeyExists),
    homeExists,
    storage,
    remoteDir,
    sshKeyExists,
    sshPubExists,
    singperaBin: SINGPERA_BIN,
    singperaBinExists: fs.existsSync(SINGPERA_BIN),
  };
}

function validateSrcDest(src, dest) {
  if (!src || typeof src !== 'string' || !src.startsWith('/')) {
    const err = new Error('src must be an absolute local path');
    err.status = 400;
    throw err;
  }
  if (!dest || typeof dest !== 'string' || !dest.includes(':')) {
    const err = new Error("dest must be 'user@host:/path'");
    err.status = 400;
    throw err;
  }
  // Basic injection guard: reject shell metacharacters
  const dangerous = /[;&|`$<>\n\r]/;
  if (dangerous.test(src) || dangerous.test(dest)) {
    const err = new Error('src/dest contain invalid characters');
    err.status = 400;
    throw err;
  }
}

function validateCron(cron) {
  if (!cron || typeof cron !== 'string') {
    const err = new Error('cron expression is required');
    err.status = 400;
    throw err;
  }
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    const err = new Error('cron must have 5 fields (e.g. "0 2 * * *")');
    err.status = 400;
    throw err;
  }
  if (/[;&|`$<>\n\r]/.test(cron)) {
    const err = new Error('cron contains invalid characters');
    err.status = 400;
    throw err;
  }
}

module.exports = {
  oneshotBackup,
  scheduleBackup,
  listJobs,
  configStatus,
  getSingperaPath,
  JOB_MARKER,
};
