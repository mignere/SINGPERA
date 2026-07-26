'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../lib/pamAuth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const ok = await authenticate(String(username), String(password));
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Could not create session' });
      }
      req.session.username = String(username);
      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: 'Could not save session' });
        }
        return res.json({ username: req.session.username });
      });
    });
  } catch (err) {
    console.error('[auth] PAM error:', err.message);
    return res.status(500).json({ error: 'Authentication backend unavailable' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not destroy session' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ username: req.session.username });
});

module.exports = router;
