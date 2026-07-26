'use strict';

const { api } = window.SingperaApi;

function showOutput(el, text) {
  el.hidden = false;
  el.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function requireSession() {
  try {
    const me = await api('/api/me');
    document.getElementById('whoami').textContent = me.username;
    return me;
  } catch {
    window.location.href = '/';
    throw new Error('unauthenticated');
  }
}

async function loadStatus() {
  const el = document.getElementById('status-body');
  try {
    const s = await api('/api/status');
    const row = (label, ok, detail) =>
      `<div><span class="${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'MISSING'}</span> — ${escapeHtml(label)}${
        detail ? `: <code>${escapeHtml(detail)}</code>` : ''
      }</div>`;

    el.innerHTML = [
      row('singpera binary', s.singperaBinExists, s.singperaBin),
      row('singpera home', s.homeExists, null),
      row('SSH private key', s.sshKeyExists, null),
      row('SSH public key', s.sshPubExists, null),
      row('default storage', Boolean(s.storage), s.storage || '(not set)'),
      row('remote dir', Boolean(s.remoteDir), s.remoteDir || '(not set)'),
      `<div>Overall: <strong class="${s.configured ? 'ok' : 'bad'}">${
        s.configured ? 'configured' : 'not fully configured'
      }</strong></div>`,
    ].join('');
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

async function loadJobs() {
  const el = document.getElementById('jobs-body');
  try {
    const { jobs } = await api('/api/backups/jobs');
    if (!jobs || jobs.length === 0) {
      el.innerHTML = '<p class="empty">No SINGPERA crontab jobs found.</p>';
      return;
    }
    el.innerHTML = `
      <table class="jobs-table">
        <thead>
          <tr><th>Cron</th><th>Command</th></tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (j) =>
                `<tr><td><code>${escapeHtml(j.cron)}</code></td><td><code>${escapeHtml(
                  j.command
                )}</code></td></tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/';
  }
});

document.getElementById('refresh-jobs').addEventListener('click', () => {
  loadJobs();
});

document.getElementById('oneshot-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const out = document.getElementById('oneshot-out');
  const btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  showOutput(out, 'Running oneshot backup…');

  try {
    const data = await api('/api/backups/oneshot', {
      method: 'POST',
      body: {
        src: document.getElementById('oneshot-src').value.trim(),
        dest: document.getElementById('oneshot-dest').value.trim(),
      },
    });
    showOutput(out, [data.stdout, data.stderr].filter(Boolean).join('\n') || 'Backup completed.');
    await loadJobs();
  } catch (err) {
    const extra = err.data
      ? [err.data.stderr, err.data.stdout].filter(Boolean).join('\n')
      : '';
    showOutput(out, `${err.message}${extra ? `\n${extra}` : ''}`);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('schedule-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const out = document.getElementById('schedule-out');
  const btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  showOutput(out, 'Creating schedule…');

  try {
    const data = await api('/api/backups/schedule', {
      method: 'POST',
      body: {
        cron: document.getElementById('schedule-cron').value.trim(),
        src: document.getElementById('schedule-src').value.trim(),
        dest: document.getElementById('schedule-dest').value.trim(),
      },
    });
    showOutput(out, [data.stdout, data.stderr].filter(Boolean).join('\n') || 'Schedule created.');
    await loadJobs();
  } catch (err) {
    const extra = err.data
      ? [err.data.stderr, err.data.stdout].filter(Boolean).join('\n')
      : '';
    showOutput(out, `${err.message}${extra ? `\n${extra}` : ''}`);
  } finally {
    btn.disabled = false;
  }
});

(async function init() {
  await requireSession();
  await Promise.all([loadStatus(), loadJobs()]);
})();
