// ============================================================================
// server/db.mjs
// SQLite database for doctor records, using Node's built-in node:sqlite
// (no extra packages, nothing to compile). One file: storage/doctors.db.
//
// Hierarchy: admin -> users -> doctors. The admin creates users (studio logins);
// every doctor record belongs to the user who made it in the studio.
//
// Tables
//   users          studio logins created by the admin (password kept as a scrypt hash)
//   user_sessions  signed-in studio browsers (only a hash of the cookie token is kept)
//   doctors    one row per doctor (a studio session), owned by a user (user_id; NULL
//              for records made before logins existed or whose user was deleted),
//              with an active flag set from the admin page's Active / Inactive switch
//   photos     each photo uploaded       -> file in storage/1.photo/
//   downloads  each portrait downloaded  -> file in storage/2.Downloaded Image/
// Deleting a doctor deletes their photo and download rows (ON DELETE CASCADE);
// the server removes the files.
//
// The functions return the same shape the admin page uses:
//   { id, createdAt, updatedAt, doctorName, caption, photos: [...], downloads: [...] }
// On first start, records from the older storage/doctors.json are imported once
// and that file is renamed to doctors.json.imported.
// ============================================================================
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
  -- Classic journal mode: every change goes straight into doctors.db itself, so it is
  -- always the one complete, up-to-date file (no doctors.db-wal / -shm side files) and
  -- any SQLite viewer shows the latest data.
  PRAGMA journal_mode = DELETE;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS doctors (
    id           TEXT PRIMARY KEY,           -- studio session id
    created_at   TEXT NOT NULL,              -- ISO date-time
    updated_at   TEXT NOT NULL,
    doctor_name  TEXT NOT NULL DEFAULT '',
    caption      TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS doctors_updated ON doctors (updated_at);

  CREATE TABLE IF NOT EXISTS photos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id    TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
    file         TEXT NOT NULL UNIQUE,       -- name inside storage/1.photo/
    size         INTEGER NOT NULL,
    uploaded_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS photos_doctor ON photos (doctor_id);

  CREATE TABLE IF NOT EXISTS downloads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id      TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
    file           TEXT NOT NULL UNIQUE,     -- name inside storage/2.Downloaded Image/
    size           INTEGER NOT NULL,
    downloaded_at  TEXT NOT NULL,
    doctor_name    TEXT NOT NULL DEFAULT '', -- as shown on that portrait
    caption        TEXT NOT NULL DEFAULT '',
    shade_id       TEXT NOT NULL DEFAULT '',
    shade_name     TEXT NOT NULL DEFAULT '',
    frame          TEXT NOT NULL DEFAULT '',
    frame_label    TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS downloads_doctor ON downloads (doctor_id);

  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name   TEXT NOT NULL DEFAULT '',
    password_hash  TEXT NOT NULL,             -- scrypt$<salt>$<hash>
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    last_login_at  TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash  TEXT PRIMARY KEY,             -- sha256 of the cookie token
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL              -- ms since 1970
  );
`;

/** Stored studio settings (JSON text) -> object, or null if missing / invalid. */
function parseSettings(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function openDatabase(storageDir) {
  const db = new DatabaseSync(path.join(storageDir, 'doctors.db'));
  db.exec(SCHEMA);
  // Added later: Active / Inactive switch from the admin page (1 = active). Existing
  // databases get the column on first start; existing doctors start as active.
  if (!db.prepare(`PRAGMA table_info(doctors)`).all().some((c) => c.name === 'active')) {
    db.exec(`ALTER TABLE doctors ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
  }
  // Added later, for editing a doctor from the admin page:
  //   settings         studio settings used for that portrait (JSON: shadeIntensity, adjust)
  //   photo_file       the uploaded photo it was made from ('' = the sample portrait)
  //   edited_by_admin  1 when the admin made/saved it from the admin editing mode
  const downloadCols = db.prepare(`PRAGMA table_info(downloads)`).all().map((c) => c.name);
  if (!downloadCols.includes('settings')) db.exec(`ALTER TABLE downloads ADD COLUMN settings TEXT NOT NULL DEFAULT ''`);
  if (!downloadCols.includes('photo_file')) db.exec(`ALTER TABLE downloads ADD COLUMN photo_file TEXT NOT NULL DEFAULT ''`);
  if (!downloadCols.includes('edited_by_admin')) db.exec(`ALTER TABLE downloads ADD COLUMN edited_by_admin INTEGER NOT NULL DEFAULT 0`);
  // Added later: the user (studio login) who made the doctor's record
  if (!db.prepare(`PRAGMA table_info(doctors)`).all().some((c) => c.name === 'user_id')) {
    db.exec(`ALTER TABLE doctors ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE SET NULL`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS doctors_user ON doctors (user_id)`);

  const q = {
    ensureDoctor: db.prepare(`INSERT INTO doctors (id, created_at, updated_at, user_id) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`),
    ownerOf: db.prepare(`SELECT user_id FROM doctors WHERE id = ?`),
    setOwner: db.prepare(`UPDATE doctors SET user_id = ? WHERE id = ?`),
    touch: db.prepare(`UPDATE doctors SET updated_at = ? WHERE id = ?`),
    setDetails: db.prepare(`
      UPDATE doctors SET
        doctor_name = CASE WHEN ? <> '' THEN ? ELSE doctor_name END,
        caption     = CASE WHEN ? <> '' THEN ? ELSE caption END,
        updated_at  = ?
      WHERE id = ?`),
    addPhoto: db.prepare(`INSERT INTO photos (doctor_id, file, size, uploaded_at) VALUES (?, ?, ?, ?)`),
    addDownload: db.prepare(`
      INSERT INTO downloads (doctor_id, file, size, downloaded_at, doctor_name, caption, shade_id, shade_name, frame, frame_label, settings, photo_file, edited_by_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    latestPhoto: db.prepare(`SELECT file FROM photos WHERE doctor_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1`),
    // Admin edits set the exact values (so a caption can also be cleared)
    setDetailsExact: db.prepare(`UPDATE doctors SET doctor_name = ?, caption = ?, updated_at = ? WHERE id = ?`),
    doctors: db.prepare(`SELECT * FROM doctors ORDER BY updated_at DESC`),
    doctor: db.prepare(`SELECT * FROM doctors WHERE id = ?`),
    allPhotos: db.prepare(`SELECT * FROM photos ORDER BY uploaded_at`),
    allDownloads: db.prepare(`SELECT * FROM downloads ORDER BY downloaded_at`),
    photosOf: db.prepare(`SELECT * FROM photos WHERE doctor_id = ? ORDER BY uploaded_at`),
    downloadsOf: db.prepare(`SELECT * FROM downloads WHERE doctor_id = ? ORDER BY downloaded_at`),
    deleteDoctor: db.prepare(`DELETE FROM doctors WHERE id = ?`),
    setActive: db.prepare(`UPDATE doctors SET active = ? WHERE id = ?`),
    // Users (studio logins) and their sign-in sessions
    users: db.prepare(`
      SELECT u.*, (SELECT COUNT(*) FROM doctors d WHERE d.user_id = u.id) AS doctors
      FROM users u ORDER BY u.created_at, u.id`),
    user: db.prepare(`SELECT * FROM users WHERE id = ?`),
    userByName: db.prepare(`SELECT * FROM users WHERE username = ?`),
    addUser: db.prepare(`INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)`),
    setUserName: db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`),
    setUserPassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
    setUserActive: db.prepare(`UPDATE users SET active = ? WHERE id = ?`),
    setUserLogin: db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`),
    deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`),
    addSession: db.prepare(`INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`),
    session: db.prepare(`
      SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`),
    deleteSession: db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`),
    deleteSessionsOf: db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`),
    pruneSessions: db.prepare(`DELETE FROM user_sessions WHERE expires_at <= ?`),
    count: db.prepare(`
      SELECT (SELECT COUNT(*) FROM doctors) AS doctors,
             (SELECT COUNT(*) FROM doctors WHERE active = 1) AS active,
             (SELECT COUNT(*) FROM photos) AS photos,
             (SELECT COUNT(*) FROM downloads) AS downloads,
             (SELECT COUNT(*) FROM users) AS users`),
  };

  /** Run several statements as one all-or-nothing transaction. */
  const transaction = (fn) => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const toPhoto = (r) => ({ file: r.file, size: r.size, uploadedAt: r.uploaded_at });
  const toDownload = (r) => ({
    file: r.file,
    size: r.size,
    downloadedAt: r.downloaded_at,
    doctorName: r.doctor_name,
    caption: r.caption,
    shadeId: r.shade_id,
    shadeName: r.shade_name,
    frame: r.frame,
    frameLabel: r.frame_label,
    settings: parseSettings(r.settings),
    photoFile: r.photo_file || '',
    editedByAdmin: r.edited_by_admin === 1,
  });
  const toUser = (u) => ({
    id: Number(u.id),
    username: u.username,
    displayName: u.display_name,
    active: u.active !== 0,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at || '',
    ...(u.doctors !== undefined && { doctors: Number(u.doctors) }),
  });
  const toRecord = (d, photos = [], downloads = []) => ({
    id: d.id,
    userId: d.user_id == null ? null : Number(d.user_id),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    doctorName: d.doctor_name,
    caption: d.caption,
    active: d.active !== 0,
    photos,
    downloads,
  });

  const api = {
    /**
     * Who owns this doctor record: 'new' (no record yet), 'mine' (this user's, or an
     * older record without a user, which this user then takes over) or 'other'.
     */
    ownership(session, userId) {
      const row = q.ownerOf.get(session);
      if (!row) return 'new';
      return row.user_id == null || Number(row.user_id) === userId ? 'mine' : 'other';
    },

    /** A user uploaded a doctor's photo in the studio. */
    addPhoto(session, userId, { file, size, at }) {
      transaction(() => {
        q.ensureDoctor.run(session, at, at, userId);
        q.setOwner.run(userId, session);
        q.addPhoto.run(session, file, size, at);
        q.touch.run(at, session);
      });
    },

    /** A user downloaded a doctor's portrait; the doctor's name and caption are updated from it. */
    addDownload(session, userId, d) {
      transaction(() => {
        q.ensureDoctor.run(session, d.at, d.at, userId);
        q.setOwner.run(userId, session);
        const photo = q.latestPhoto.get(session)?.file || '';
        q.addDownload.run(session, d.file, d.size, d.at, d.doctorName, d.caption, d.shadeId, d.shadeName, d.frame, d.frameLabel, d.settings || '', photo, 0);
        q.setDetails.run(d.doctorName, d.doctorName, d.caption, d.caption, d.at, session);
      });
    },

    /** Admin replaced an existing doctor's photo (from the studio's admin editing mode). */
    addAdminPhoto(id, { file, size, at }) {
      if (!q.doctor.get(id)) return false;
      transaction(() => {
        q.addPhoto.run(id, file, size, at);
        q.touch.run(at, id);
      });
      return true;
    },

    /** Admin saved an edited portrait for an existing doctor; name and caption are set exactly. */
    addAdminDownload(id, d) {
      if (!q.doctor.get(id)) return false;
      transaction(() => {
        const photo = q.latestPhoto.get(id)?.file || '';
        q.addDownload.run(id, d.file, d.size, d.at, d.doctorName, d.caption, d.shadeId, d.shadeName, d.frame, d.frameLabel, d.settings || '', photo, 1);
        q.setDetailsExact.run(d.doctorName, d.caption, d.at, id);
      });
      return true;
    },

    exists: (id) => Boolean(q.doctor.get(id)),

    /** Every doctor with their photos and downloads, most recent activity first. */
    listRecords() {
      const photos = new Map();
      const downloads = new Map();
      for (const p of q.allPhotos.all()) (photos.get(p.doctor_id) || photos.set(p.doctor_id, []).get(p.doctor_id)).push(toPhoto(p));
      for (const d of q.allDownloads.all()) (downloads.get(d.doctor_id) || downloads.set(d.doctor_id, []).get(d.doctor_id)).push(toDownload(d));
      return q.doctors.all().map((d) => toRecord(d, photos.get(d.id), downloads.get(d.id)));
    },

    totals() {
      const t = q.count.get();
      const doctors = Number(t.doctors);
      const active = Number(t.active);
      return { users: Number(t.users), doctors, active, inactive: doctors - active, photos: Number(t.photos), downloads: Number(t.downloads) };
    },

    /** Move a doctor to another user (null = no user); false if the doctor or user does not exist. */
    setOwner(id, userId) {
      if (userId != null && !q.user.get(userId)) return false;
      return Number(q.setOwner.run(userId, id).changes) > 0;
    },

    // ---- Users (studio logins) ----
    listUsers: () => q.users.all().map(toUser),
    getUser(id) {
      const u = q.user.get(id);
      return u ? toUser(u) : null;
    },
    /** For signing in: the raw user row (with its password hash), or null. */
    findLogin: (username) => q.userByName.get(username) || null,
    /** Returns the new user, or null if the username is taken. */
    addUser({ username, displayName, passwordHash, at }) {
      if (q.userByName.get(username)) return null;
      const id = q.addUser.run(username, displayName, passwordHash, at).lastInsertRowid;
      return api.getUser(Number(id));
    },
    /** Change name / password / active. A new password or deactivating signs the user out everywhere. */
    updateUser(id, { displayName, passwordHash, active }) {
      if (!q.user.get(id)) return null;
      transaction(() => {
        if (displayName !== undefined) q.setUserName.run(displayName, id);
        if (passwordHash !== undefined) {
          q.setUserPassword.run(passwordHash, id);
          q.deleteSessionsOf.run(id);
        }
        if (active !== undefined) {
          q.setUserActive.run(active ? 1 : 0, id);
          if (!active) q.deleteSessionsOf.run(id);
        }
      });
      return api.getUser(id);
    },
    /** Delete a login. Their doctors stay, without a user (doctors.user_id becomes NULL). */
    deleteUser: (id) => Number(q.deleteUser.run(id).changes) > 0,

    // ---- Studio sign-in sessions ----
    addSession(tokenHash, userId, expiresAt, at) {
      q.pruneSessions.run(Date.now());
      q.addSession.run(tokenHash, userId, expiresAt);
      q.setUserLogin.run(at, userId);
    },
    /** The signed-in, active user for a session, or null. */
    sessionUser(tokenHash) {
      const u = q.session.get(tokenHash, Date.now());
      return u ? toUser(u) : null;
    },
    deleteSession: (tokenHash) => q.deleteSession.run(tokenHash),

    /** Active / Inactive switch; returns false if the doctor does not exist. */
    setActive(id, active) {
      return Number(q.setActive.run(active ? 1 : 0, id).changes) > 0;
    },

    getRecord(id) {
      const d = q.doctor.get(id);
      return d ? toRecord(d, q.photosOf.all(id).map(toPhoto), q.downloadsOf.all(id).map(toDownload)) : null;
    },

    /** Delete a doctor and their rows; returns the deleted record (for removing its files). */
    deleteRecord(id) {
      const rec = api.getRecord(id);
      if (rec) q.deleteDoctor.run(id);
      return rec;
    },

    close: () => db.close(),
  };

  // One-time import of records saved by the earlier JSON version
  const legacy = path.join(storageDir, 'doctors.json');
  if (existsSync(legacy) && api.totals().doctors === 0) {
    const old = JSON.parse(readFileSync(legacy, 'utf8'));
    transaction(() => {
      for (const r of Object.values(old)) {
        q.ensureDoctor.run(r.id, r.createdAt, r.updatedAt, null);
        q.setDetails.run(r.doctorName || '', r.doctorName || '', r.caption || '', r.caption || '', r.updatedAt, r.id);
        for (const p of r.photos || []) q.addPhoto.run(r.id, p.file, p.size || 0, p.uploadedAt);
        for (const d of r.downloads || [])
          q.addDownload.run(r.id, d.file, d.size || 0, d.downloadedAt, d.doctorName || '', d.caption || '', d.shadeId || '', d.shadeName || '', d.frame || '', d.frameLabel || '', '', '', 0);
      }
    });
    renameSync(legacy, `${legacy}.imported`);
    console.log(`Imported ${Object.keys(old).length} record(s) from doctors.json into doctors.db`);
  }

  return api;
}
