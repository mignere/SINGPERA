'use strict';

const express = require('express');
const singpera = require('../lib/singpera');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return next();
}

router.use(requireAuth);

router.get('/status', async (req, res) => {
  try {
    const status = await singpera.configStatus();
    return res.json(status);
  } catch (err) {
    console.error('[status]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to read status' });
  }
});

router.post('/backups/oneshot', async (req, res) => {
  const { src, dest } = req.body || {};
  try {
    const result = await singpera.oneshotBackup(src, dest);
    return res.json({
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('[oneshot]', err.message);
    return res.status(status).json({
      error: err.message || 'Oneshot backup failed',
      stderr: err.stderr || undefined,
      stdout: err.stdout || undefined,
    });
  }
});

router.post('/backups/schedule', async (req, res) => {
  const { cron, src, dest } = req.body || {};
  try {
    const result = await singpera.scheduleBackup(cron, src, dest);
    return res.json({
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('[schedule]', err.message);
    return res.status(status).json({
      error: err.message || 'Schedule backup failed',
      stderr: err.stderr || undefined,
      stdout: err.stdout || undefined,
    });
  }
});

router.get('/backups/jobs', async (req, res) => {
  try {
    const jobs = await singpera.listJobs();
    return res.json({ jobs });
  } catch (err) {
    console.error('[jobs]', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to list jobs',
      stderr: err.stderr || undefined,
    });
  }
});

module.exports = router;
