// ============================================================================
// services/eventStore.js
// Sends the doctor's uploaded photo and downloaded portrait to the event server
// (server/index.mjs), which keeps them in storage/1.photo and
// storage/2.Downloaded Image. Visitor saves are fire-and-forget: if the server
// is unreachable the studio keeps working normally and the download still happens.
//
// The studio requires a signed-in user (created by the admin): every doctor record
// belongs to the user who made it (admin -> users -> doctors).
//
// Admin editing mode (/studio/?edit=<record id>, opened from the admin page):
// setEditTarget(id) makes savePhoto / saveDownload go to that doctor's record
// through the password-protected admin API instead of creating a new visitor.
// ============================================================================

// Site root: the studio lives at /studio/, the API at /api/ (see assets.js for the base logic)
const raw = import.meta.env.BASE_URL;
const ROOT = raw === './' ? '../' : raw;
const API = `${ROOT}api`;
const ADMIN = `${ROOT}admin`;

/** Link back to the admin page (used by the editing banner). */
export const ADMIN_PAGE = `${ADMIN}/`;

let editTarget = null; // record id while the admin is editing a doctor
export const setEditTarget = (id) => {
  editTarget = id || null;
};

/** URL of a stored photo (admin only; the browser sends the admin sign-in cookie). */
export const adminPhotoUrl = (file) => `${ADMIN}/files/photo/${encodeURIComponent(file)}`;

/** Load one doctor's record for editing. Returns { ok, status, record }. */
export async function loadRecordForEdit(id) {
  try {
    const res = await fetch(`${ADMIN}/api/records/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, record: await res.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Studio sign-in (users are created by the admin). The server keeps the session
// in an HttpOnly cookie; these calls only ask it.
// ---------------------------------------------------------------------------

/** Who is signed in: { ok, signedIn, user } (ok false = server unreachable). */
export async function getMe() {
  try {
    const res = await fetch(`${API}/me`, { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/json')) return { ok: false };
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false };
  }
}

/** Sign in; resolves to { ok, status, user }. A new sign-in always starts a new doctor. */
export async function signIn(username, password) {
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) newDoctor();
    return { ok: res.ok, status: res.status, user: body.user };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function signOut() {
  newDoctor();
  await fetch(`${API}/logout`, { method: 'POST' }).catch(() => {});
}

// Called when the server says the sign-in has ended (expired, password changed, user made inactive)
let onSignedOut = () => {};
export const setSignedOutHandler = (fn) => {
  onSignedOut = fn || (() => {});
};

const SESSION_KEY = 'eye-shade-studio-session';
/** Start a new doctor record: the next photo / portrait gets a fresh record id. */
export function newDoctor() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** One id per doctor (kept for the browser tab), so a doctor's photo and portraits end up in the same record. */
function sessionId() {
  const KEY = SESSION_KEY;
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    /* storage blocked: fall through to a fresh id */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16)); // works on plain http too (randomUUID does not)
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** POST an image; resolves to { ok, status } and never throws. */
async function post(url, params, blob) {
  try {
    const query = new URLSearchParams(params);
    const res = await fetch(`${url}?${query}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    if (!res.ok) console.warn(`Saving to the event server failed (${res.status}).`);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('Event server unreachable; nothing was saved.', err);
    return { ok: false, status: 0 };
  }
}

/**
 * Save for the signed-in user. If this tab's doctor record belongs to another user
 * (409, e.g. someone else signed in on this tab), start a new doctor and try once more.
 */
async function postAsUser(path, params, blob) {
  let res = await post(`${API}/${path}`, { session: sessionId(), ...params }, blob);
  if (res.status === 409) {
    newDoctor();
    res = await post(`${API}/${path}`, { session: sessionId(), ...params }, blob);
  }
  if (res.status === 401) onSignedOut();
  return res;
}

/** Save the doctor's photo (a data: URL from the file picker or camera). */
export async function savePhoto(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return { ok: false, status: 0 };
  const blob = await (await fetch(dataUrl)).blob();
  if (editTarget) return post(`${ADMIN}/api/records/${encodeURIComponent(editTarget)}/photos`, {}, blob);
  return postAsUser('photos', {}, blob);
}

/**
 * Save the portrait on the canvas, with everything it shows. Resolves to { ok, status }.
 * meta: { doctorName, caption, shade, frame, shadeIntensity, adjust }
 */
export function saveDownload(canvas, { doctorName, caption, shade, frame, shadeIntensity, adjust }) {
  if (!canvas) return Promise.resolve({ ok: false, status: 0 });
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve({ ok: false, status: 0 });
        const params = {
          name: doctorName || '',
          caption: caption || '',
          shade: shade?.id || '',
          shadeName: shade?.name || '',
          frame: frame?.key || '',
          frameLabel: frame?.label || '',
          settings: JSON.stringify({ shadeIntensity, adjust }),
        };
        resolve(
          editTarget
            ? post(`${ADMIN}/api/records/${encodeURIComponent(editTarget)}/portrait`, params, blob)
            : postAsUser('downloads', params, blob)
        );
      },
      'image/png',
      1
    );
  });
}
