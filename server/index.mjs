// ============================================================================
// server/index.mjs
// Eye Shade Studio server: runs the site and stores doctors' photos and portraits.
//
//   storage/1.photo/              every photo a doctor uploads in the studio
//   storage/2.Downloaded Image/   every portrait a doctor downloads from the studio
//   storage/doctors.db            SQLite database (see server/db.mjs): one record
//                                 per doctor visit with name, caption, and every
//                                 photo and download (shade, frame, times, file names)
//
// Hierarchy: admin -> users -> doctors. The admin creates users on the admin page;
// a user signs in to the studio and every doctor they make belongs to them.
//
// Studio API (a signed-in user is required, cookie "ess_user"):
//   POST /api/login | logout           sign in / out ({ username, password })
//   GET  /api/me                       who is signed in
//   POST /api/photos?session=<id>      body: the uploaded image
//   POST /api/downloads?session=<id>&name=&caption=&shade=&shadeName=&frame=&frameLabel=
//                                      body: the downloaded PNG
// Admin (password protected: sign-in form + session cookie, user "admin" by default):
//   /admin/                            the admin page (shows a sign-in form)
//   POST /admin/api/login | logout     sign in / out (session cookie)
//   /admin/api/records                 all doctor records (JSON)
//   /admin/api/export.csv              spreadsheet: one row per photo/portrait, with links to the files
//   GET /admin/api/records/:id         one record (the studio's admin editing mode loads it)
//   POST /admin/api/records/:id/photos     admin replaced the doctor's photo
//   POST /admin/api/records/:id/portrait   admin saved an edited portrait
//   PATCH /admin/api/records/:id       { active?: true | false, userId?: number | null }
//   GET | POST /admin/api/users        list users / create one { username, displayName, password }
//   PATCH /admin/api/users/:id         { displayName?, password?, active? }
//   DELETE /admin/api/users/:id        delete a login (their doctors stay, without a user)
//   DELETE /admin/api/records/:id      remove a record and its files
//   /admin/files/photo/<file>          an uploaded photo
//   /admin/files/downloads/<file>      a downloaded portrait
//
// Run:  npm run dev    (development, with Vite hot reload)
//       npm run build && npm start    (production, serves dist/)
// Settings (.env in the project folder): ADMIN_PASSWORD (required for /admin),
// ADMIN_USER (default "admin"), PORT, STORAGE_DIR (default ./storage).
// ============================================================================
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || (DEV ? 5173 : 3000);
const STORAGE = path.resolve(ROOT, process.env.STORAGE_DIR || 'storage');
const PHOTO_DIR = path.join(STORAGE, '1.photo');
const DOWNLOAD_DIR = path.join(STORAGE, '2.Downloaded Image');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

await fs.mkdir(PHOTO_DIR, { recursive: true });
await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

// Doctor records: SQLite database in storage/doctors.db
const db = openDatabase(STORAGE);

const now = () => new Date().toISOString();
/** 2026-11-18_14-03-22 (local time), for file names that sort by date. */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
const clean = (s, max = 120) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const safeName = (s) => clean(s, 80).replace(/[^a-z0-9._-]+/gi, '_').replace(/^[._]+/, '') || 'file';
const SESSION_RE = /^[a-zA-Z0-9-]{8,64}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp' };

/** Write a file without ever overwriting an existing one. */
async function saveUnique(dir, base, ext, data) {
  let name = `${base}.${ext}`;
  for (let i = 2; existsSync(path.join(dir, name)); i++) name = `${base}_${i}.${ext}`;
  await fs.writeFile(path.join(dir, name), data);
  return name;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);

const imageBody = express.raw({ type: 'image/*', limit: '25mb' });
const jsonBody = express.json({ limit: '4kb' });

// ---------------------------------------------------------------------------
// Passwords, cookies and the sign-in rate limit (shared by admin and users)
// ---------------------------------------------------------------------------
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const tokenHash = (token) => digest(token).toString('hex');
const readCookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const secureFlag = (req) => (req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');

/** scrypt$<salt>$<hash> */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(String(password), salt, 32).toString('hex')}`;
}
function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}
// Used when the username does not exist, so a wrong username takes as long as a wrong password
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// Slow down password guessing: at most 8 failed sign-ins per address per 10 minutes
const failures = new Map(); // ip -> [timestamps]
const recentFailures = (ip) => (failures.get(ip) || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
const clientIp = (req) => req.socket.remoteAddress || '';

// ---------------------------------------------------------------------------
// Studio users: sign-in (users are created by the admin, see /admin/api/users)
// ---------------------------------------------------------------------------
const USER_COOKIE = 'ess_user';
const USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // a week, so staff stay signed in through an event
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

/** The signed-in studio user, or null. */
function studioUser(req) {
  const token = readCookie(req, USER_COOKIE);
  return token ? db.sessionUser(tokenHash(token)) : null;
}
function requireUser(req, res, next) {
  const user = studioUser(req);
  if (!user) return res.status(401).json({ error: 'sign-in required' });
  req.user = user;
  next();
}

app.post('/api/login', jsonBody, (req, res) => {
  const ip = clientIp(req);
  if (recentFailures(ip).length >= 8) return res.status(429).json({ error: 'too many attempts' });
  const username = clean(req.body?.username, 64);
  const password = String(req.body?.password ?? '');
  const row = USERNAME_RE.test(username) ? db.findLogin(username) : null;
  const ok = checkPassword(password, row?.password_hash || DUMMY_HASH) && Boolean(row);
  if (!ok) {
    failures.set(ip, [...recentFailures(ip), Date.now()]);
    return res.status(401).json({ error: 'wrong username or password' });
  }
  if (!row.active) return res.status(403).json({ error: 'inactive' });
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  db.addSession(tokenHash(token), row.id, Date.now() + USER_SESSION_MS, now());
  res.set('Set-Cookie', `${USER_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${USER_SESSION_MS / 1000}${secureFlag(req)}`);
  res.json({ ok: true, user: db.getUser(row.id) });
});

app.post('/api/logout', (req, res) => {
  const token = readCookie(req, USER_COOKIE);
  if (token) db.deleteSession(tokenHash(token));
  res.set('Set-Cookie', `${USER_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

/** Lets the studio decide whether to show its sign-in page. */
app.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const user = studioUser(req);
  res.json({ signedIn: Boolean(user), user });
});

/** A doctor record (studio session) belongs to one user; another user may not add to it. */
function checkOwner(session, user, res) {
  if (db.ownership(session, user.id) !== 'other') return true;
  res.status(409).json({ error: 'This doctor belongs to another user. Start a new doctor.' });
  return false;
}

/** Studio: a user uploaded a doctor's photo. */
app.post('/api/photos', requireUser, imageBody, async (req, res) => {
  const session = String(req.query.session || '');
  const ext = EXT[(req.headers['content-type'] || '').split(';')[0]];
  if (!SESSION_RE.test(session) || !ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Expected an image and a session id.' });
  }
  if (!checkOwner(session, req.user, res)) return;
  const file = await saveUnique(PHOTO_DIR, `${stamp()}_${session.slice(0, 8)}`, ext, req.body);
  db.addPhoto(session, req.user.id, { file, size: req.body.length, at: now() });
  res.status(201).json({ ok: true, file });
});

/**
 * Studio settings sent with a portrait (JSON in ?settings=): only known numeric
 * fields are kept, clamped to the studio's ranges. Returns JSON text ('' if none).
 */
function cleanSettings(text) {
  let raw;
  try {
    raw = JSON.parse(String(text || ''));
  } catch {
    return '';
  }
  if (!raw || typeof raw !== 'object') return '';
  const num = (v, lo, hi, dflt) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : dflt);
  const a = raw.adjust && typeof raw.adjust === 'object' ? raw.adjust : {};
  return JSON.stringify({
    shadeIntensity: num(raw.shadeIntensity, 0.2, 1, 0.78),
    adjust: {
      zoom: num(a.zoom, 1, 4, 1),
      offsetX: num(a.offsetX, -1, 1, 0),
      offsetY: num(a.offsetY, -1, 1, 0),
      rotate: num(a.rotate, -45, 45, 0),
      brightness: num(a.brightness, 50, 150, 100),
      contrast: num(a.contrast, 50, 150, 100),
    },
  });
}

/** Save a downloaded portrait PNG and return the fields describing it. */
async function storePortrait(q, body) {
  const doctorName = clean(q.name, 80);
  const base = `${stamp()}_World_Sight_Day_Dr_${safeName(doctorName.replace(/^dr\.?\s*/i, '') || 'doctor')}_${safeName(q.shade || 'shade')}`;
  const file = await saveUnique(DOWNLOAD_DIR, base, 'png', body);
  return {
    file,
    size: body.length,
    at: now(),
    doctorName,
    caption: clean(q.caption, 160),
    shadeId: clean(q.shade, 40),
    shadeName: clean(q.shadeName, 40),
    frame: clean(q.frame, 40),
    frameLabel: clean(q.frameLabel, 40),
    settings: cleanSettings(q.settings),
  };
}
const isPng = (req) => req.headers['content-type'] === 'image/png' && Buffer.isBuffer(req.body) && req.body.length > 0;

/** Studio: a user downloaded a doctor's portrait. */
app.post('/api/downloads', requireUser, imageBody, async (req, res) => {
  const session = String(req.query.session || '');
  if (!SESSION_RE.test(session) || !isPng(req)) {
    return res.status(400).json({ error: 'Expected a PNG and a session id.' });
  }
  if (!checkOwner(session, req.user, res)) return;
  const portrait = await storePortrait(req.query, req.body);
  db.addDownload(session, req.user.id, portrait);
  res.status(201).json({ ok: true, file: portrait.file });
});

// ---------------------------------------------------------------------------
// Admin sign-in. The /admin/ page itself holds no data and loads freely; it shows
// a sign-in form. Signing in (POST /admin/api/login) sets an HttpOnly session
// cookie; all doctor data and files (/admin/api/*, /admin/files/*) require it.
// HTTP Basic auth is also accepted, for scripts (e.g. curl -u admin:password).
// ---------------------------------------------------------------------------
const validLogin = (user, pass) => same(user, ADMIN_USER) && same(pass, ADMIN_PASSWORD);

const SESSION_COOKIE = 'ess_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map(); // token -> expiry time
const cookieValue = (req) => readCookie(req, SESSION_COOKIE);

function isSignedIn(req) {
  const token = cookieValue(req);
  if (token && sessions.get(token) > Date.now()) return true;
  if (token) sessions.delete(token);
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
    return validLogin(user, rest.join(':'));
  }
  return false;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'locked' });
  if (isSignedIn(req)) return next();
  // A file link opened in the browser (e.g. from the CSV) while signed out: show the sign-in page
  if (req.method === 'GET' && req.originalUrl.startsWith('/admin/files/') && req.accepts(['html', 'json']) === 'html') {
    return res.redirect('/admin/');
  }
  res.status(401).json({ error: 'sign-in required' });
}

// "/admin" -> "/admin/" (Express also matches "/admin/" here, so check the exact path to avoid a loop)
app.get('/admin', (req, res, next) => (req.originalUrl.split('?')[0] === '/admin' ? res.redirect(301, '/admin/') : next()));

app.post('/admin/api/login', jsonBody, (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'locked' });
  const ip = clientIp(req);
  if (recentFailures(ip).length >= 8) return res.status(429).json({ error: 'too many attempts' });
  const { username = ADMIN_USER, password = '' } = req.body || {};
  if (!validLogin(String(username), String(password))) {
    failures.set(ip, [...recentFailures(ip), Date.now()]);
    return res.status(401).json({ error: 'wrong username or password' });
  }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.set('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secureFlag(req)}`);
  res.json({ ok: true });
});

app.post('/admin/api/logout', (req, res) => {
  sessions.delete(cookieValue(req));
  res.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0`);
  res.json({ ok: true });
});

/** Lets the page know whether to show the sign-in form. */
app.get('/admin/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ locked: !ADMIN_PASSWORD, signedIn: Boolean(ADMIN_PASSWORD) && isSignedIn(req), user: ADMIN_USER });
});

app.use(['/admin/api', '/admin/files'], requireAdmin);
app.use('/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store'); // never cache doctors' data
  res.set('X-Robots-Tag', 'noindex');
  next();
});

app.get('/admin/api/records', (req, res) => {
  res.json({
    records: db.listRecords(), // most recent activity first
    users: db.listUsers(), // with how many doctors each has
    totals: db.totals(),
    folders: { photos: path.relative(ROOT, PHOTO_DIR), downloads: path.relative(ROOT, DOWNLOAD_DIR) },
  });
});

// One row per entry: every uploaded photo and every downloaded portrait is its own line,
// so each file gets a working link (a spreadsheet cell can only hold one link).
//   "Open in browser" opens the PNG/JPG through the admin site (works from any device; asks for the admin sign-in)
// Links are =HYPERLINK() formulas, which Excel, Google Sheets and LibreOffice turn into clickable links.
app.get('/admin/api/export.csv', (req, res) => {
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // Text typed by users must never run as a formula in the spreadsheet
  const text = (v) => quote(/^[=+\-@\t\r]/.test(String(v ?? '')) ? `'${v}` : v);
  // Excel accepts at most 255 characters per text in a formula; longer ones are written as plain text
  const link = (target, label) => {
    const t = String(target).replace(/"/g, '');
    const l = String(label).replace(/"/g, '');
    return t.length > 255 || l.length > 255 ? text(t) : quote(`=HYPERLINK("${t}","${l}")`);
  };
  const when = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const site = `${req.protocol}://${req.get('host')}`;
  const userNames = new Map(db.listUsers().map((u) => [u.id, u.displayName || u.username]));

  const header = ['User', 'Doctor name', 'Caption', 'Status', 'Entry', 'Date', 'Eye colour', 'Frame', 'File name', 'Open in browser'];
  const lines = [header.map(quote).join(',')];
  for (const r of db.listRecords().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const doctor = [text(userNames.get(r.userId) || ''), text(r.doctorName), text(r.caption), quote(r.active ? 'Active' : 'Inactive')];
    const entries = [
      ...r.photos.map((ph) => ({ at: ph.uploadedAt, kind: 'Photo uploaded', file: ph.file, route: 'photo', shade: '', frame: '' })),
      ...r.downloads.map((d) => ({ at: d.downloadedAt, kind: 'Portrait downloaded', file: d.file, route: 'downloads', shade: d.shadeName, frame: d.frameLabel })),
    ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

    if (!entries.length) {
      lines.push([...doctor, quote('No files yet'), quote(when(r.createdAt)), '', '', '', ''].join(','));
      continue;
    }
    for (const e of entries) {
      lines.push(
        [
          ...doctor,
          quote(e.kind),
          quote(when(e.at)),
          text(e.shade),
          text(e.frame),
          text(e.file),
          link(`${site}/admin/files/${e.route}/${encodeURIComponent(e.file)}`, 'Open'),
        ].join(',')
      );
    }
  }
  res.set('Content-Disposition', `attachment; filename="eye-shade-studio-doctors-${stamp()}.csv"`);
  res.type('text/csv').send(`﻿${lines.join('\r\n')}\r\n`);
});

// ---- Editing a doctor from the admin page (the studio's admin editing mode) ----

/** One doctor's record (the studio loads it to edit). */
app.get('/admin/api/records/:id', (req, res) => {
  const rec = db.getRecord(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  res.json(rec);
});

/** Admin uploaded or took a new photo for this doctor. */
app.post('/admin/api/records/:id/photos', imageBody, async (req, res) => {
  const ext = EXT[(req.headers['content-type'] || '').split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Expected an image.' });
  if (!db.exists(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const file = await saveUnique(PHOTO_DIR, `${stamp()}_${safeName(req.params.id).slice(0, 8)}_admin`, ext, req.body);
  db.addAdminPhoto(req.params.id, { file, size: req.body.length, at: now() });
  res.status(201).json({ ok: true, file });
});

/** Admin saved the edited portrait: stored in 2.Downloaded Image, marked "edited by admin". */
app.post('/admin/api/records/:id/portrait', imageBody, async (req, res) => {
  if (!isPng(req)) return res.status(400).json({ error: 'Expected a PNG.' });
  if (!db.exists(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const portrait = await storePortrait(req.query, req.body);
  db.addAdminDownload(req.params.id, portrait);
  res.status(201).json({ ok: true, file: portrait.file });
});

/**
 * Active / Inactive switch on a doctor's card, and moving a doctor to another user.
 * Body: { "active"?: true | false, "userId"?: number | null }
 */
app.patch('/admin/api/records/:id', jsonBody, (req, res) => {
  const { active, userId } = req.body || {};
  const hasActive = typeof active === 'boolean';
  const hasUser = userId === null || Number.isInteger(userId);
  if (!hasActive && !hasUser) return res.status(400).json({ error: 'Expected { "active": true | false } or { "userId": number | null }' });
  if (!db.exists(req.params.id)) return res.status(404).json({ error: 'Not found' });
  if (hasUser && !db.setOwner(req.params.id, userId)) return res.status(400).json({ error: 'No such user' });
  if (hasActive) db.setActive(req.params.id, active);
  res.json({ ok: true, record: db.getRecord(req.params.id) });
});

// ---- Users (studio logins): admin -> users -> doctors ----

/** Validates { username?, displayName?, password?, active? }; returns { error } or the clean fields. */
function userFields(body, { creating }) {
  const out = {};
  if (creating || body.username !== undefined) {
    const username = clean(body.username, 64);
    if (!USERNAME_RE.test(username)) return { error: 'Username: 3 to 32 letters, numbers, dots, dashes or underscores.' };
    out.username = username;
  }
  // Optional: without a name, the user is shown by their username
  if (creating || body.displayName !== undefined) out.displayName = clean(body.displayName, 80);
  if (creating || body.password !== undefined) {
    const password = String(body.password ?? '');
    if (password.length < 6 || password.length > 128) return { error: 'Password: at least 6 characters.' };
    out.passwordHash = hashPassword(password);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { error: 'active must be true or false.' };
    out.active = body.active;
  }
  return out;
}

app.get('/admin/api/users', (req, res) => res.json({ users: db.listUsers() }));

app.post('/admin/api/users', jsonBody, (req, res) => {
  const f = userFields(req.body || {}, { creating: true });
  if (f.error) return res.status(400).json({ error: f.error });
  const user = db.addUser({ ...f, at: now() });
  if (!user) return res.status(409).json({ error: `The username “${f.username}” is already taken.` });
  res.status(201).json({ ok: true, user: { ...user, doctors: 0 } });
});

app.patch('/admin/api/users/:id', jsonBody, (req, res) => {
  const id = Number(req.params.id);
  const { username, ...f } = userFields(req.body || {}, { creating: false }); // usernames do not change
  if (f.error) return res.status(400).json({ error: f.error });
  if (username !== undefined) return res.status(400).json({ error: 'The username cannot be changed.' });
  const user = Number.isInteger(id) ? db.updateUser(id, f) : null;
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, user });
});

app.delete('/admin/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !db.deleteUser(id)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/admin/api/records/:id', async (req, res) => {
  const rec = db.deleteRecord(req.params.id); // removes the doctor's rows (photos and downloads cascade)
  if (!rec) return res.status(404).json({ error: 'Not found' });
  for (const p of rec.photos) await fs.rm(path.join(PHOTO_DIR, path.basename(p.file)), { force: true });
  for (const d of rec.downloads) await fs.rm(path.join(DOWNLOAD_DIR, path.basename(d.file)), { force: true });
  res.json({ ok: true });
});

/** Serve a stored file by name (only plain names inside the folder, never paths). */
function sendStored(dir) {
  return (req, res) => {
    const name = req.params.name;
    if (name !== path.basename(name) || name.startsWith('.')) return res.status(400).end();
    const file = path.join(dir, name);
    if (!existsSync(file)) return res.status(404).end();
    if (req.query.download !== undefined) res.attachment(name);
    res.sendFile(file);
  };
}
app.get('/admin/files/photo/:name', sendStored(PHOTO_DIR));
app.get('/admin/files/downloads/:name', sendStored(DOWNLOAD_DIR));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------------------------------------------------------------------
// The site itself: Vite in development, the built dist/ folder in production
// ---------------------------------------------------------------------------
// The site's three pages. Any other address gets the 404 page (server/404.html).
const PAGES = { '/': 'index.html', '/studio/': 'studio/index.html', '/admin/': 'admin/index.html' };
const pageFor = (p) => PAGES[p] || PAGES[p.replace(/index\.html$/, '')];
// "/studio" -> "/studio/" (keeps ?edit=...)
app.get('/studio', (req, res, next) => (req.path === '/studio' ? res.redirect(301, `/studio/${req.originalUrl.slice('/studio'.length)}`) : next()));

if (DEV) {
  // appType "custom": Vite serves the code, styles and public files; the pages are sent here,
  // so an unknown address falls through to the 404 page instead of Vite's empty 404.
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.get('*', async (req, res, next) => {
    const page = pageFor(req.path);
    if (!page) return next();
    try {
      const html = await vite.transformIndexHtml(req.originalUrl, await fs.readFile(path.join(ROOT, page), 'utf8'));
      res.status(200).type('html').send(html);
    } catch (err) {
      vite.ssrFixStacktrace?.(err);
      next(err);
    }
  });
} else {
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(dist)) {
    console.error('No dist/ folder. Run "npm run build" first.');
    process.exit(1);
  }
  app.use(express.static(dist, { index: 'index.html' }));
}

// 404: a page for browsers, a short answer for everything else (images, scripts, API calls)
const NOT_FOUND_PAGE = path.join(ROOT, 'server', '404.html');
app.use((req, res) => {
  res.status(404);
  if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts(['html', 'json', 'text']) === 'html') {
    return res.set('Cache-Control', 'no-store').sendFile(NOT_FOUND_PAGE);
  }
  if (req.accepts(['json', 'text']) === 'json') return res.json({ error: 'Not found' });
  res.type('text').send('Not found');
});

// Startup message in Vite's own layout:
//
//   VITE v5.4.21  ready in 312 ms
//
//   ➜  Local:   http://localhost:5173/
//   ➜  Network: http://192.168.1.5:5173/
//
// (colours are left out when the output is not a terminal or NO_COLOR is set)
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (open, close) => (t) => (useColor ? `\x1b[${open}m${t}\x1b[${close}m` : String(t));
const c = { green: paint(32, 39), cyan: paint(36, 39), yellow: paint(33, 39), bold: paint(1, 22), dim: paint(2, 22) };
const url = (host) => c.cyan(`http://${host}:${c.bold(PORT)}/`);
let viteVersion = '';
try {
  viteVersion = (await import('vite')).version; // a dev dependency; may be missing in production installs
} catch {
  /* no version shown */
}

server.listen(PORT, () => {
  // Addresses other devices on the same Wi-Fi (e.g. a phone) can open
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  const ms = Math.round(performance.now());
  const title = `${c.bold('VITE')}${viteVersion ? ` v${viteVersion}` : ''}`;
  const lines = [
    '',
    `  ${c.green(title)}  ${c.dim('ready in')} ${c.bold(ms)} ${c.dim('ms')}${DEV ? '' : c.dim('  (production)')}`,
    '',
    `  ${c.green('➜')}  ${c.bold('Local')}:   ${url('localhost')}`,
    ...lan.map((ip) => `  ${c.green('➜')}  ${c.bold('Network')}: ${url(ip)}`),
  ];
  if (!ADMIN_PASSWORD) lines.push(`  ${c.yellow('➜')}  ${c.bold('Admin')}:   ${c.yellow('locked, set ADMIN_PASSWORD in .env and restart')}`);
  console.log(`${lines.join('\n')}\n`);
});

// Close the database cleanly on Ctrl+C / shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
}
