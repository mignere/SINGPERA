'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PAM_HELPER = path.join(__dirname, 'pam_helper.py');

/**
 * Authenticate a Linux user via PAM (source of truth: system accounts).
 * Uses a small Python helper that calls libpam.so — no native Node addon required.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<boolean>}
 */
function authenticate(username, password) {
  return new Promise((resolve, reject) => {
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      resolve(false);
      return;
    }

    // Reject obviously unsafe usernames before talking to PAM
    if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(username) || username.length > 32) {
      resolve(false);
      return;
    }

    const child = spawn('python3', [PAM_HELPER], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LANG: 'C' },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('PAM authentication timed out'));
      }
    }, 10000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const result = stdout.trim();
      if (code === 0 && result === 'OK') {
        resolve(true);
        return;
      }
      if (result === 'FAIL' || code === 1) {
        resolve(false);
        return;
      }
      reject(new Error(stderr.trim() || `PAM helper exited with code ${code}`));
    });

    child.stdin.write(JSON.stringify({ username, password }));
    child.stdin.end();
  });
}

module.exports = { authenticate };
