'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const DATA_PATH = path.resolve(process.env.DATA_PATH || path.join(__dirname, '..', 'data', 'data.json'));
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_LOGIN_BYTES = 4096;
const SESSION_SECONDS = 8 * 60 * 60;
const REQUIRED_HEADERS = ['Name', 'Phone', 'Team', 'Role description'];
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '')
  .split(',').map(value => value.trim()).filter(Boolean));
const loginAttempts = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function secureHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function authorized(req) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const cookieHeader = String(req.headers.cookie || '');
  const session = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('lrc_admin='))?.slice(10);
  if (!session) return false;
  const [expires, signature] = session.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', secret).update(expires).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function credentialsMatch(username, password) {
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword || typeof username !== 'string' || typeof password !== 'string') return false;
  const userA = Buffer.from(expectedUsername);
  const userB = Buffer.from(username);
  const passA = Buffer.from(expectedPassword);
  const passB = Buffer.from(password);
  return userA.length === userB.length && crypto.timingSafeEqual(userA, userB)
    && passA.length === passB.length && crypto.timingSafeEqual(passA, passB);
}

function sessionCookie() {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  const signature = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(expires).digest('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `lrc_admin=${expires}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

function loginAllowed(req) {
  const key = req.headers['fly-client-ip'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const previous = loginAttempts.get(key);
  const attempt = !previous || now - previous.startedAt > 15 * 60 * 1000
    ? { count: 0, startedAt: now }
    : previous;
  return { key, attempt, allowed: attempt.count < 5 };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length) throw new Error(`Unexpected quote near row ${rows.length + 1}`);
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(values => values.some(value => value.trim()));
}

function membersFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The CSV file is empty');
  const headers = rows[0].map(value => value.trim());
  const normalized = headers.map(value => value.toLocaleLowerCase());
  const indexes = REQUIRED_HEADERS.map(header => normalized.indexOf(header.toLocaleLowerCase()));
  const missing = REQUIRED_HEADERS.filter((_, index) => indexes[index] < 0);
  if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);

  const errors = [];
  const members = [];
  rows.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const [name, rawPhone, team, roleDescription] = indexes.map(index => (values[index] || '').trim());
    const phone = rawPhone.replace(/[^\d]/g, '');
    if (!name) errors.push(`Row ${rowNumber}: Name is required`);
    if (!team) errors.push(`Row ${rowNumber}: Team is required`);
    if (!roleDescription) errors.push(`Row ${rowNumber}: Role description is required`);
    if (rawPhone && !/^[1-9]\d{6,14}$/.test(phone)) errors.push(`Row ${rowNumber}: Phone must contain 7–15 international digits`);
    if (name && team && roleDescription && (!rawPhone || /^[1-9]\d{6,14}$/.test(phone))) {
      members.push({
        id: crypto.createHash('sha256').update(`${name}\u0000${phone}\u0000${team}\u0000${roleDescription}`).digest('hex').slice(0, 16),
        name,
        phone,
        team,
        roleDescription
      });
    }
  });
  if (errors.length) {
    const error = new Error(errors.slice(0, 20).join('\n'));
    error.details = errors.slice(0, 20);
    throw error;
  }
  if (!members.length) throw new Error('The CSV has headers but no member rows');
  return members;
}

async function readData() {
  try {
    const value = JSON.parse(await fsp.readFile(DATA_PATH, 'utf8'));
    return { members: Array.isArray(value.members) ? value.members : [], updatedAt: value.updatedAt || null };
  } catch (error) {
    if (error.code === 'ENOENT') return { members: [], updatedAt: null };
    throw error;
  }
}

async function writeData(members) {
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  const payload = JSON.stringify({ members, updatedAt: new Date().toISOString() }, null, 2);
  const tempPath = `${DATA_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tempPath, payload, { mode: 0o600 });
  await fsp.rename(tempPath, DATA_PATH);
  return JSON.parse(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('CSV file exceeds the 5 MB limit'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') sendJson(res, 404, { error: 'Not found' });
    else throw error;
  }
}

const server = http.createServer(async (req, res) => {
  secureHeaders(res);
  corsHeaders(req, res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      res.writeHead(204);
      res.end();
    } else if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok' });
    } else if (req.method === 'GET' && url.pathname === '/api/members') {
      sendJson(res, 200, await readData());
    } else if (req.method === 'GET' && url.pathname === '/api/admin/session') {
      sendJson(res, authorized(req) ? 200 : 401, { authenticated: authorized(req) });
    } else if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const limiter = loginAllowed(req);
      if (!limiter.allowed) {
        sendJson(res, 429, { error: 'Too many login attempts. Try again in 15 minutes.' });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(await readBody(req, MAX_LOGIN_BYTES));
      } catch {
        sendJson(res, 400, { error: 'Enter a valid admin password' });
        return;
      }
      if (!credentialsMatch(payload.username, payload.password)) {
        limiter.attempt.count += 1;
        loginAttempts.set(limiter.key, limiter.attempt);
        sendJson(res, 401, { error: 'Incorrect admin username or password' });
        return;
      }
      loginAttempts.delete(limiter.key);
      sendJson(res, 200, { authenticated: true }, { 'Set-Cookie': sessionCookie() });
    } else if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      sendJson(res, 200, { authenticated: false }, {
        'Set-Cookie': `lrc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
      });
    } else if (req.method === 'POST' && url.pathname === '/api/admin/import') {
      if (!authorized(req)) {
        sendJson(res, 401, { error: 'Invalid or missing admin token' });
        return;
      }
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('text/csv')) {
        sendJson(res, 415, { error: 'Upload the file with Content-Type: text/csv' });
        return;
      }
      const members = membersFromCsv(await readBody(req, MAX_CSV_BYTES));
      const saved = await writeData(members);
      sendJson(res, 200, { imported: members.length, updatedAt: saved.updatedAt });
    } else if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
      if (authorized(req)) {
        res.writeHead(302, { Location: '/admin/upload' });
        res.end();
      } else {
        await serveStatic(req, res, '/login.html');
      }
    } else if (req.method === 'GET' && url.pathname === '/admin/upload') {
      if (!authorized(req)) {
        res.writeHead(302, { Location: '/admin' });
        res.end();
      } else {
        await serveStatic(req, res, '/admin.html');
      }
    } else if (url.pathname === '/admin.html') {
      res.writeHead(302, { Location: '/admin' });
      res.end();
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url.pathname);
    } else {
      sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST, OPTIONS' });
    }
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 400, { error: error.message || 'Request failed', details: error.details });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LRC Child Festival server listening on port ${PORT}`);
  });
}

module.exports = { parseCsv, membersFromCsv };
