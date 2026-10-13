'use strict';

const form = document.querySelector('#login-form');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const status = document.querySelector('#status');
const button = form.querySelector('button');

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.hidden = true;
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login failed');
    location.replace('/admin/upload');
  } catch (error) {
    status.hidden = false;
    status.className = 'status error';
    status.textContent = error.message;
    password.select();
  } finally {
    button.disabled = false;
  }
});
