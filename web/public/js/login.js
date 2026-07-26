'use strict';

const { api } = window.SingperaApi;

async function redirectIfLoggedIn() {
  try {
    await api('/api/me');
    window.location.href = '/app';
  } catch {
    // stay on login
  }
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  btn.disabled = true;

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    await api('/api/login', {
      method: 'POST',
      body: { username, password },
    });
    window.location.href = '/app';
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed';
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

redirectIfLoggedIn();
