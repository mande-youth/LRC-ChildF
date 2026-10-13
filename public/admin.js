'use strict';

const form = document.querySelector('#import-form');
const fileInput = document.querySelector('#csv-file');
const summary = document.querySelector('#file-summary');
const status = document.querySelector('#status');
const button = form.querySelector('button');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  summary.textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Maximum file size: 5 MB.';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return;
  button.disabled = true;
  status.hidden = false;
  status.className = 'status';
  status.textContent = 'Validating and importing…';
  try {
    const response = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      body: await file.text()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details?.join('\n') || result.error || 'Import failed');
    status.textContent = `Imported ${result.imported} member${result.imported === 1 ? '' : 's'} successfully. The public directory is now updated.`;
    form.reset();
    summary.textContent = 'Maximum file size: 5 MB.';
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.replace('/admin');
});
