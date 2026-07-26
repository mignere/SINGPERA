'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const backupRoutes = require('./routes/backups');

const app = express();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3080;
const SESSION_SECRET = process.env.SESSION_SECRET || 'singpera-dev-change-me';

app.set('trust proxy', 1);

app.use(express.json({ limit: '64kb' }));
app.use(
  session({
    name: 'singpera.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === '1',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'singpera-web' });
});

app.use('/api', authRoutes);
app.use('/api', backupRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`SINGPERA web console listening on http://${HOST}:${PORT}`);
  if (SESSION_SECRET === 'singpera-dev-change-me') {
    console.warn('[warn] Using default SESSION_SECRET. Set SESSION_SECRET in production.');
  }
});
