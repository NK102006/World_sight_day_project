// ============================================================================
// AdminApp.jsx
// Admin page (/admin/): every doctor who used the studio, with the photos they
// uploaded (storage/1.photo) and the portraits they downloaded
// (storage/2.Downloaded Image). Data comes from the server's /admin/api/*
// endpoints, which are protected by the admin password (see server/index.mjs).
//
// Doctor cards with an Active / Inactive switch, a status filter (All / Active /
// Inactive), search, a details pop-up per doctor (their photos and portraits, large
// preview, download, delete), CSV export. Refreshes every 15 seconds.
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, EyeOff, FileSpreadsheet, Folder, Image as ImageIcon, LogIn, LogOut, Pencil, RefreshCw, Search, Trash2, User, X } from 'lucide-react';
import { EYE_SHADES } from '../components/ShadeSelector';
import { ActiveSwitch, userName } from './ui';
import { UsersPanel, UserHeader, UserDialog, ConfirmDeleteUser } from './Users';

const photoUrl = (file) => `files/photo/${encodeURIComponent(file)}`;
const downloadUrl = (file) => `files/downloads/${encodeURIComponent(file)}`;
const shadeHex = (id) => EYE_SHADES.find((s) => s.id === id)?.hex || '#8A94A3';
/** Opens the studio in admin editing mode for this doctor (every studio field editable). */
const editUrl = (record) => `../studio/?edit=${encodeURIComponent(record.id)}`;

const when = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const size = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

function Stat({ label, value, note }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
      <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1 truncate text-xs text-ink-faint" title={note}>{note}</p>}
    </div>
  );
}

/** Square thumbnail that opens the large preview. */
function Thumb({ src, label, sub, onOpen, accent }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-28 shrink-0 text-left"
      title={`${label}${sub ? ` · ${sub}` : ''}`}
    >
      <span className="relative block aspect-square overflow-hidden rounded-xl bg-paper ring-1 ring-line transition group-hover:ring-2 group-hover:ring-ink">
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        {accent && <span className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full ring-2 ring-white" style={{ background: accent }} />}
      </span>
      <span className="mt-1 block truncate text-xs font-medium text-ink">{label}</span>
      {sub && <span className="block truncate text-[11px] text-ink-soft">{sub}</span>}
    </button>
  );
}

function DoctorCard({ record, onOpen, onDelete }) {
  const name = record.doctorName || 'Name not entered yet';
  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-tint text-ink">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className={`truncate font-display text-xl font-semibold ${record.doctorName ? 'text-ink' : 'text-ink-faint'}`}>
              {record.doctorName && !/^dr\.?\s/i.test(record.doctorName) ? `Dr. ${name}` : name}
            </h2>
            {record.caption && <p className="truncate text-sm text-ink-soft">{record.caption}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>First visit {when(record.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>Last activity {when(record.updatedAt)}</span>
          <a
            href={editUrl(record)}
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 font-semibold text-white hover:bg-stage-raised"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit in studio
          </a>
          <button
            type="button"
            onClick={() => onDelete(record)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Folder className="h-4 w-4 text-ink-soft" />
            1.photo <span className="font-normal text-ink-soft">({record.photos.length})</span>
          </h3>
          {record.photos.length ? (
            <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
              {record.photos.map((p) => (
                <Thumb
                  key={p.file}
                  src={photoUrl(p.file)}
                  label={when(p.uploadedAt)}
                  sub={size(p.size)}
                  onOpen={() => onOpen({ kind: 'photo', file: p.file, title: `Uploaded photo · ${name}`, meta: when(p.uploadedAt) })}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-faint">No photo uploaded (used the sample portrait).</p>
          )}
        </section>
        <section>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Folder className="h-4 w-4 text-ink-soft" />
            2.Downloaded Image <span className="font-normal text-ink-soft">({record.downloads.length})</span>
          </h3>
          {record.downloads.length ? (
            <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
              {record.downloads.map((d) => (
                <Thumb
                  key={d.file}
                  src={downloadUrl(d.file)}
                  accent={shadeHex(d.shadeId)}
                  label={`${d.shadeName || d.shadeId} · ${d.frameLabel || d.frame}`}
                  sub={d.editedByAdmin ? `Edited by admin · ${when(d.downloadedAt)}` : when(d.downloadedAt)}
                  onOpen={() =>
                    onOpen({
                      kind: 'download',
                      file: d.file,
                      title: `Downloaded portrait · ${name}`,
                      meta: `${d.shadeName || d.shadeId} eyes · ${d.frameLabel || d.frame} frame · ${when(d.downloadedAt)}`,
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-faint">No portrait downloaded yet.</p>
          )}
        </section>
      </div>
    </article>
  );
}

/**
 * Small doctor card for the Doctors grid: latest portrait (or uploaded photo),
 * name, caption, counts, shades chosen, last activity, and the Active / Inactive
 * switch. Click the card (not the switch) to see everything.
 */
function DoctorTile({ record, onSelect, onToggleActive, busy }) {
  const latestDownload = record.downloads[record.downloads.length - 1];
  const latestPhoto = record.photos[record.photos.length - 1];
  const cover = latestDownload ? downloadUrl(latestDownload.file) : latestPhoto ? photoUrl(latestPhoto.file) : null;
  const shades = [...new Map(record.downloads.map((d) => [d.shadeId, d])).values()];
  const name = record.doctorName ? (/^dr\.?\s/i.test(record.doctorName) ? record.doctorName : `Dr. ${record.doctorName}`) : 'Name not entered yet';

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(15,42,46,0.45)] ${
        record.active ? 'border-line' : 'border-dashed border-ink/25'
      }`}
    >
    <button
      type="button"
      onClick={() => onSelect(record.id)}
      aria-label={`Open ${name}`}
      className={`group flex flex-1 flex-col text-left transition-opacity ${record.active ? '' : 'opacity-55 grayscale-[60%]'}`}
    >
      <span className="relative block aspect-square w-full overflow-hidden bg-paper">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-ink-faint">
            <User className="h-10 w-10" />
          </span>
        )}
        {latestDownload && (
          <span className="absolute left-2 top-2 rounded-full bg-stage/85 px-2 py-0.5 text-[10px] font-semibold text-white">Portrait</span>
        )}
        {!latestDownload && latestPhoto && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink">Photo only</span>
        )}
        {!record.active && (
          <span className="absolute right-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Inactive</span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-3">
        <span className={`truncate font-display text-[15px] font-semibold ${record.doctorName ? 'text-ink' : 'text-ink-faint'}`}>{name}</span>
        <span className="mt-0.5 truncate text-xs text-ink-soft">{record.caption || ' '}</span>
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-medium text-ink-soft">
            <span className="inline-flex items-center gap-1" title="Uploaded photos (1.photo)">
              <ImageIcon className="h-3.5 w-3.5" />
              {record.photos.length}
            </span>
            <span className="inline-flex items-center gap-1" title="Downloaded portraits (2.Downloaded Image)">
              <Download className="h-3.5 w-3.5" />
              {record.downloads.length}
            </span>
          </span>
          <span className="flex -space-x-1" title={shades.map((d) => d.shadeName).join(', ')}>
            {shades.slice(0, 5).map((d) => (
              <span key={d.shadeId} className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: shadeHex(d.shadeId) }} />
            ))}
          </span>
        </span>
        <span className="mt-1.5 truncate text-[11px] text-ink-faint">Last activity {when(record.updatedAt)}</span>
      </span>
    </button>
    <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
      <ActiveSwitch
        active={record.active}
        busy={busy}
        onChange={(next) => onToggleActive(record, next)}
        label={`${name}: ${record.active ? 'active' : 'inactive'}`}
      />
      <a
        href={editUrl(record)}
        aria-label={`Edit ${name} in the studio`}
        title="Edit in studio"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </a>
    </div>
    </article>
  );
}

/**
 * Pop-up with everything about one doctor (the full DoctorCard).
 * Esc closes it only while it is the top layer (escEnabled): with a preview or the
 * delete confirmation open on top, Esc closes that one instead.
 */
function DoctorDetails({ record, onClose, onOpen, onDelete, escEnabled }) {
  useEffect(() => {
    if (!escEnabled) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, escEnabled]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Doctor details" className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-stage/60 p-4 sm:items-center" onClick={onClose}>
      <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-2 right-2 z-10 inline-flex h-9 w-9 -translate-y-full items-center justify-center rounded-full bg-white text-ink shadow sm:right-0"
        >
          <X className="h-5 w-5" />
        </button>
        <DoctorCard record={record} onOpen={onOpen} onDelete={onDelete} />
      </div>
    </div>
  );
}

const displayName = (record) =>
  record.doctorName ? (/^dr\.?\s/i.test(record.doctorName) ? record.doctorName : `Dr. ${record.doctorName}`) : 'this visitor';

/**
 * The page's own "Delete?" pop-up (replaces the browser's confirm box).
 * Cancel is focused first, so pressing Enter by accident never deletes; Esc cancels.
 * If the delete fails, the error shows inside the pop-up.
 */
function ConfirmDelete({ record, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = React.useRef(null);
  const cover = record.downloads.at(-1) ? downloadUrl(record.downloads.at(-1).file) : record.photos.at(-1) ? photoUrl(record.photos.at(-1).file) : null;

  // One steady Esc listener for the pop-up's lifetime (reads the latest state through a ref,
  // so it is never swapped out in the middle of a key press)
  const latest = React.useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !latest.current.busy && latest.current.onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(record);
    } catch (err) {
      setError(err.message || 'Delete failed.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stage/60 p-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {cover ? (
            <img src={cover} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-line" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <Trash2 className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <p id="confirm-title" className="font-display text-xl font-semibold text-ink">
              Delete {displayName(record)}?
            </p>
            <div id="confirm-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              <p>This permanently removes:</p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  {record.photos.length} uploaded photo{record.photos.length === 1 ? '' : 's'} from <span className="font-medium text-ink">1.photo</span>
                </li>
                <li>
                  {record.downloads.length} downloaded portrait{record.downloads.length === 1 ? '' : 's'} from{' '}
                  <span className="font-medium text-ink">2.Downloaded Image</span>
                </li>
                <li>their record in the database</li>
              </ul>
              <p className="mt-1.5 font-medium text-red-700">This cannot be undone.</p>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Preview({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const src = item.kind === 'photo' ? photoUrl(item.file) : downloadUrl(item.file);
  return (
    <div role="dialog" aria-modal="true" aria-label={item.title} className="fixed inset-0 z-50 flex flex-col bg-stage/95 p-4 text-white" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">{item.title}</p>
          <p className="truncate text-sm text-white/65">{item.meta}</p>
          <p className="truncate text-xs text-white/45">{item.file}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={`${src}?download`} className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink">
            <Download className="h-4 w-4" /> Download
          </a>
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
            <ExternalLink className="h-4 w-4" /> Open
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center pt-4">
        <img src={src} alt={item.title} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign-in gate
// ---------------------------------------------------------------------------

/** Full-page message card (server not running, admin locked). */
function Notice({ title, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-sm">
        <p className="font-display text-2xl font-semibold text-ink">{title}</p>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </div>
  );
}
const Code = ({ children }) => <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;

/** The admin sign-in card. */
function SignIn({ onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) return onSignedIn();
      setError(
        res.status === 429
          ? 'Too many wrong attempts. Wait 10 minutes and try again.'
          : res.status === 503
            ? 'The admin page is locked: no password is set on the server.'
            : 'Wrong username or password.'
      );
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-[14px] border-[1.5px] border-line bg-white py-2.5 text-[15px] font-semibold text-ink outline-none transition-colors focus:border-teal';

  // Same card as the studio's user sign-in (src/StudioGate.jsx), with admin wording
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="fx-rise w-full max-w-sm">
        <form onSubmit={submit} className="rounded-[24px] border-[1.5px] border-line bg-card p-6 shadow-[0_30px_60px_-30px_rgba(15,42,46,0.35)] sm:p-7">
          <div className="flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink">
              <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
                <path d="M2 16 Q16 3 30 16 Q16 29 2 16 Z" fill="#F4F0E6" />
                <circle cx="16" cy="16" r="6.5" fill="#3FA7D6" />
                <circle cx="16" cy="16" r="2.8" fill="#0F2A2E" />
                <circle cx="14.2" cy="14.2" r="1.1" fill="#fff" />
              </svg>
            </span>
          </div>
          <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-teal">Admin sign-in</p>
          <h1 className="mt-1.5 font-display text-[1.85rem] font-semibold leading-tight text-ink">
            Welcome back, <em className="text-teal">chief.</em>
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-soft">Sign in to see doctors, photos and downloaded portraits.</p>

          <label className="mt-5 block text-[13px] font-extrabold text-ink" htmlFor="admin-user">
            Username
          </label>
          <input
            id="admin-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className={`mt-1 px-3.5 ${field}`}
          />
          <label className="mt-4 block text-[13px] font-extrabold text-ink" htmlFor="admin-pass">
            Password
          </label>
          <div className="relative mt-1">
            <input
              id="admin-pass"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={`pl-3.5 pr-11 ${field}`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <a href="../" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          ← Back to home
        </a>
      </div>
    </div>
  );
}

/** Decides what to show: server missing, locked, sign-in form, or the dashboard. */
export default function AdminApp() {
  const [state, setState] = useState({ view: 'checking' });

  const check = useCallback(async () => {
    try {
      const res = await fetch('api/status', { cache: 'no-store' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('application/json')) return setState({ view: 'no-server' });
      const s = await res.json();
      setState({ view: s.locked ? 'locked' : s.signedIn ? 'dashboard' : 'sign-in', user: s.user });
    } catch {
      setState({ view: 'no-server' });
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);

  if (state.view === 'checking') return <div className="min-h-screen bg-paper" />;
  if (state.view === 'no-server')
    return (
      <Notice title="The admin page needs the event server">
        <p>
          This page was opened without the Eye Shade Studio server running (for example with <Code>npx vite</Code> or{' '}
          <Code>npm run preview</Code>), so there is no data to show and nothing is being saved.
        </p>
        <p>
          Stop that command, then in the <Code>eye_shade_studio_project</Code> folder run <Code>npm run dev</Code> and open{' '}
          <Code>http://localhost:5173/admin/</Code>.
        </p>
      </Notice>
    );
  if (state.view === 'locked')
    return (
      <Notice title="The admin page is locked">
        <p>
          No admin password is set. Open the <Code>.env</Code> file in the <Code>eye_shade_studio_project</Code> folder, set{' '}
          <Code>ADMIN_PASSWORD=</Code> to a password of your choice, save, and restart <Code>npm run dev</Code>.
        </p>
      </Notice>
    );
  if (state.view === 'sign-in') return <SignIn onSignedIn={() => setState({ view: 'dashboard' })} />;
  return <Dashboard onSignedOut={() => setState({ view: 'sign-in', user: state.user })} />;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
/** The user opened from the address: #user=3 -> 3, #user=none -> 'none', otherwise null (list of users). */
function readUserHash() {
  const m = /^#user=(none|\d+)$/.exec(window.location.hash);
  return m ? (m[1] === 'none' ? 'none' : Number(m[1])) : null;
}

function Dashboard({ onSignedOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all'); // all | active | inactive
  const [pending, setPending] = useState(() => new Set()); // ids whose switch is being saved
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // doctor whose details pop-up is open

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('api/records', { cache: 'no-store' });
      if (res.status === 401) return onSignedOut(); // session expired
      if (!res.ok) throw new Error(`Server error (${res.status}).`);
      setData(await res.json());
      setError('');
    } catch (err) {
      setError(err.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  const signOut = async () => {
    await fetch('api/logout', { method: 'POST' }).catch(() => {});
    onSignedOut();
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const records = data?.records || [];
  const users = data?.users || [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const unassigned = records.filter((r) => r.userId == null || !usersById.has(r.userId)).length;

  // Two levels: the list of users (openUser null), or one user's doctors (a user id, or
  // 'none' for doctors without a user). Kept in the address (#user=3) so the browser's
  // Back button and reloading work.
  const [openUser, setOpenUser] = useState(readUserHash);
  const goTo = useCallback((id, { replace = false } = {}) => {
    const url = id == null ? window.location.pathname + window.location.search : `#user=${id}`;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setOpenUser(id);
    setQuery('');
    setStatus('all');
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onNav = () => {
      setOpenUser(readUserHash());
      setQuery('');
      setStatus('all');
    };
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);
  const openedUser = typeof openUser === 'number' ? usersById.get(openUser) : null;
  useEffect(() => {
    // the open user was deleted, or "No user" has emptied: back to the list of users
    if (data && ((typeof openUser === 'number' && !openedUser) || (openUser === 'none' && !unassigned))) goTo(null, { replace: true });
  }, [data, openUser, openedUser, unassigned, goTo]);
  const inGroup = (r) => (openUser === 'none' ? r.userId == null || !usersById.has(r.userId) : r.userId === openUser);

  const q = query.trim().toLowerCase();
  const matchesSearch = (r) => !q || `${r.doctorName} ${r.caption}`.toLowerCase().includes(q);
  const searched = records.filter(inGroup).filter(matchesSearch);
  const counts = {
    all: searched.length,
    active: searched.filter((r) => r.active).length,
    inactive: searched.filter((r) => !r.active).length,
  };
  const shown = searched.filter((r) => status === 'all' || (status === 'active') === r.active);
  const activeUsers = users.filter((u) => u.active).length;

  /** Active / Inactive switch: update the card at once, save, and undo if saving fails. */
  const toggleActive = async (record, active) => {
    const setLocal = (value) =>
      setData((d) => d && { ...d, records: d.records.map((r) => (r.id === record.id ? { ...r, active: value } : r)) });
    setLocal(active);
    setPending((s) => new Set(s).add(record.id));
    try {
      const res = await fetch(`api/records/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (res.status === 401) return onSignedOut();
      if (!res.ok) throw new Error();
      setToast(`${displayName(record)} is now ${active ? 'active' : 'inactive'}`);
    } catch {
      setLocal(!active);
      setToast(`Could not change ${displayName(record)}. Try again.`);
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(record.id);
        return next;
      });
    }
  };

  // Delete: ask in the page's own confirm pop-up (not the browser's), then report with a toast
  const [confirming, setConfirming] = useState(null); // record waiting for confirmation
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- Users (admin -> users -> doctors) ----
  const [userDialog, setUserDialog] = useState(null); // { user } (user null = add a new one)
  const [deletingUser, setDeletingUser] = useState(null);
  const [userPending, setUserPending] = useState(null); // id whose switch is being saved

  /** JSON request to the admin API; throws an Error with the server's message. */
  const send = async (url, method, body) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    if (res.status === 401) {
      onSignedOut();
      throw new Error('Your session has ended. Sign in again.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Server error (${res.status}).`);
    return json;
  };

  const saveUser = async (fields) => {
    const editing = userDialog?.user;
    const json = editing ? await send(`api/users/${editing.id}`, 'PATCH', fields) : await send('api/users', 'POST', fields);
    load();
    return json.user;
  };
  const closeUserDialog = (message) => {
    setUserDialog(null);
    if (message) setToast(message);
  };

  const toggleUserActive = async (user, active) => {
    setUserPending(user.id);
    try {
      await send(`api/users/${user.id}`, 'PATCH', { active });
      setData((d) => d && { ...d, users: d.users.map((u) => (u.id === user.id ? { ...u, active } : u)) });
      setToast(active ? `${userName(user)} can sign in again` : `${userName(user)} is inactive and signed out of the studio`);
    } catch (err) {
      setToast(err.message);
    } finally {
      setUserPending(null);
    }
  };

  const confirmDeleteUser = async (user) => {
    await send(`api/users/${user.id}`, 'DELETE');
    setDeletingUser(null);
    setToast(`Deleted ${userName(user)}. Their doctors are under “No user”.`);
    load();
  };

  const remove = (record) => setConfirming(record);
  const confirmDelete = async (record) => {
    const res = await fetch(`api/records/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.status === 401 ? 'Your session has ended. Sign in again.' : `The server could not delete this record (error ${res.status}).`);
    setConfirming(null);
    setSelectedId(null);
    setToast(`Deleted ${displayName(record)}`);
    load();
  };
  const selected = records.find((r) => r.id === selectedId) || null;

  const filters = [
    ['all', `All (${counts.all})`],
    ['active', `Active (${counts.active})`],
    ['inactive', `Inactive (${counts.inactive})`],
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="font-display text-xl font-semibold">Eye Shade Studio · Admin</p>
            <p className="text-xs text-white/60">Users and the doctors they made in the studio</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <a href="api/export.csv" className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-[#FF8466]">
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </a>
            <a href="../studio/" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
              <ExternalLink className="h-4 w-4" /> Studio
            </a>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}

        {!data && !error && <p className="text-ink-soft">Loading…</p>}

        {/* Level 1: every user */}
        {data && openUser == null && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Users" value={users.length} />
              <Stat label="Active users" value={activeUsers} />
              <Stat label="Total doctors" value={records.length} />
            </div>
            <UsersPanel
              users={users}
              unassigned={unassigned}
              onOpen={(id) => goTo(id)}
              onAdd={() => setUserDialog({ user: null })}
              onEdit={(user) => setUserDialog({ user })}
              onDelete={setDeletingUser}
              onToggleActive={toggleUserActive}
              pending={userPending != null}
            />
          </>
        )}

        {/* Level 2: the doctors under one user */}
        {data && openUser != null && (
        <>
        <UserHeader
          user={openedUser}
          onBack={() => goTo(null)}
          onEdit={() => setUserDialog({ user: openedUser })}
          onDelete={() => setDeletingUser(openedUser)}
          onToggleActive={(next) => toggleUserActive(openedUser, next)}
          busy={userPending != null}
        />

        <h3 className="mt-8 flex items-center gap-1.5 font-display text-xl font-semibold text-ink">
          Doctors <span className="font-sans text-base font-medium text-ink-soft">({records.filter(inGroup).length})</span>
        </h3>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-line">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={status === key}
                onClick={() => setStatus(key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${status === key ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search doctors</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or caption"
              className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ink"
            />
          </label>
        </div>

        <div className="mt-5">
          {shown.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {shown.map((r) => (
                  <DoctorTile
                    key={r.id}
                    record={r}
                    onSelect={setSelectedId}
                    onToggleActive={toggleActive}
                    busy={pending.has(r.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-ink-faint" />
                <p className="mt-2 font-semibold text-ink">
                  {q
                    ? 'No doctors match your search.'
                    : status !== 'all'
                      ? `No ${status} doctors.`
                      : openedUser
                        ? `${userName(openedUser)} has no doctors yet.`
                        : 'No doctors here.'}
                </p>
                {!q && status === 'all' && openedUser && (
                  <p className="mt-1 text-sm text-ink-soft">
                    Doctors appear here as soon as {userName(openedUser)} signs in to the studio and uploads a photo or downloads a portrait.
                  </p>
                )}
              </div>
            )}
        </div>
        </>
        )}
      </main>

      {selected && (
        <DoctorDetails
          record={selected}
          onClose={() => setSelectedId(null)}
          onOpen={setPreview}
          onDelete={remove}
          escEnabled={!preview && !confirming}
        />
      )}
      {preview && <Preview item={preview} onClose={() => setPreview(null)} />}
      {confirming && <ConfirmDelete record={confirming} onCancel={() => setConfirming(null)} onConfirm={confirmDelete} />}
      {userDialog && <UserDialog key={userDialog.user?.id ?? 'new'} user={userDialog.user} onSave={saveUser} onClose={closeUserDialog} />}
      {deletingUser && <ConfirmDeleteUser user={deletingUser} onCancel={() => setDeletingUser(null)} onConfirm={confirmDeleteUser} />}
      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
