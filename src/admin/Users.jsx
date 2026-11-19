// ============================================================================
// Users.jsx — the admin page's Users section (admin -> users -> doctors)
// The admin creates users (studio logins). Each user signs in to the studio and
// every doctor they make belongs to them. The admin page opens on the list of
// users; clicking a user opens a page with only that user's doctors.
// ============================================================================
import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, Eye, EyeOff, KeyRound, Pencil, RefreshCw, Search, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { ActiveSwitch, Modal, initials, userName } from './ui';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const studioLink = () => new URL('../studio/', window.location.href).href;

/** A readable random password (no look-alike characters). */
function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => chars[b % chars.length]).join('');
}

const doctorsText = (n) => `${n} doctor${n === 1 ? '' : 's'}`;

/** User avatar: initials on navy. */
function Avatar({ user, size = 'h-11 w-11 text-sm' }) {
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-stage font-display font-semibold text-gold`}>{initials(user)}</span>;
}

/** One card in the users list: click it to open that user's doctors. */
function UserCard({ user, onOpen, onEdit, onDelete, onToggleActive, busy }) {
  return (
    <article
      className={`group flex flex-col rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(15,42,46,0.45)] ${user.active ? 'border-line' : 'border-dashed border-ink/25'}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${userName(user)}’s doctors`}
        className={`flex min-w-0 flex-1 items-center gap-3 p-4 text-left ${user.active ? '' : 'opacity-60'}`}
      >
        <Avatar user={user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold text-ink">{userName(user)}</span>
          {user.displayName && <span className="block truncate text-xs text-ink-soft">@{user.username}</span>}
          <span className="mt-1 block truncate text-[11px] text-ink-faint">{user.lastLoginAt ? `Last sign-in ${when(user.lastLoginAt)}` : 'Never signed in'}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-gold-tint px-2.5 py-1 text-xs font-semibold text-ink">{doctorsText(user.doctors)}</span>
          <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
        </span>
      </button>
      <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
        <ActiveSwitch active={user.active} busy={busy} onChange={onToggleActive} label={`${userName(user)}: ${user.active ? 'active' : 'inactive'}`} />
        <span className="flex">
          <button type="button" onClick={onEdit} title="Edit user / set a new password" aria-label={`Edit ${userName(user)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-paper">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} title="Delete user" aria-label={`Delete ${userName(user)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-700 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    </article>
  );
}

/** "No user" card: doctors made before sign-in existed, or whose user was deleted. */
function NoUserCard({ count, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open doctors without a user"
      className="group flex items-center gap-3 rounded-2xl border border-dashed border-ink/25 bg-white p-4 text-left transition hover:border-ink/50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft">
        <UsersIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-semibold text-ink">No user</span>
        <span className="block text-xs text-ink-soft">Made before sign-in, or their user was deleted</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink">{doctorsText(count)}</span>
        <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </span>
    </button>
  );
}

/**
 * First screen after the admin signs in: every user. Clicking a user opens their doctors.
 */
export function UsersPanel({ users, unassigned, onOpen, onAdd, onEdit, onDelete, onToggleActive, pending }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = users.filter((u) => !q || `${u.displayName} ${u.username}`.toLowerCase().includes(q));
  return (
    <section aria-labelledby="users-title" className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="users-title" className="font-display text-2xl font-semibold text-ink">
            Users
          </h2>
          <p className="text-sm text-ink-soft">Click a user to see the doctors under them.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {users.length > 0 && (
            <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users"
                className="w-full rounded-full border border-line bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-ink"
              />
            </label>
          )}
          <button type="button" onClick={onAdd} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-stage-raised">
            <UserPlus className="h-4 w-4" /> Add user
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            onOpen={() => onOpen(u.id)}
            onEdit={() => onEdit(u)}
            onDelete={() => onDelete(u)}
            onToggleActive={(next) => onToggleActive(u, next)}
            busy={pending}
          />
        ))}
        {!q && unassigned > 0 && <NoUserCard count={unassigned} onOpen={() => onOpen('none')} />}
      </div>
      {!users.length && (
        <div className="mt-3 rounded-2xl border border-dashed border-line p-10 text-center">
          <UsersIcon className="mx-auto h-8 w-8 text-ink-faint" />
          <p className="mt-2 font-semibold text-ink">No users yet</p>
          <p className="mt-1 text-sm text-ink-soft">Add a user so someone can sign in to the studio. Every doctor they make appears under them.</p>
        </div>
      )}
      {users.length > 0 && q && !shown.length && <p className="mt-3 text-sm text-ink-soft">No users match “{query.trim()}”.</p>}
    </section>
  );
}

/** Top of a user's page: back to all users, who they are, and their controls. */
export function UserHeader({ user, onBack, onEdit, onDelete, onToggleActive, busy }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-full py-1 pr-3 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All users
      </button>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          {user ? (
            <Avatar user={user} size="h-14 w-14 text-lg" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft">
              <UsersIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-semibold text-ink">{user ? userName(user) : 'No user'}</h2>
            <p className="truncate text-sm text-ink-soft">
              {user
                ? `${user.displayName ? `@${user.username} · ` : ''}${user.lastLoginAt ? `last sign-in ${when(user.lastLoginAt)}` : 'never signed in'}`
                : 'Doctors made before sign-in existed, or whose user was deleted'}
            </p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-1">
            <ActiveSwitch active={user.active} busy={busy} onChange={onToggleActive} label={`${userName(user)}: ${user.active ? 'active' : 'inactive'}`} />
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked (e.g. plain http on another device): the text is visible to copy by hand */
    }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line hover:ring-ink/40">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

const fieldBase = 'w-full rounded-xl border border-line px-3.5 py-2.5 text-[15px] outline-none focus:border-ink disabled:bg-paper disabled:text-ink-soft';
const field = `mt-1 ${fieldBase}`;

/**
 * Add a user, or edit one (new password). onSave(fields) resolves to the saved
 * user or throws an Error with the message to show.
 * After adding, it shows the sign-in details to hand to the new user.
 */
export function UserDialog({ user, onSave, onClose }) {
  const creating = !user;
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(creating);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // { user, password } after adding

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fields = creating ? { username: username.trim(), password } : { password };
      const saved = await onSave(fields);
      if (creating) setCreated({ user: saved, password });
      else onClose(`Saved. ${userName(saved)} must sign in again with the new password.`);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const details = `Eye Shade Studio sign-in\nStudio: ${studioLink()}\nUsername: ${created.user.username}\nPassword: ${created.password}`;
    return (
      <Modal label="User added" onClose={() => onClose(`Added ${userName(created.user)}`)}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display text-xl font-semibold text-ink">{userName(created.user)} can now sign in</p>
        <p className="mt-1 text-sm text-ink-soft">Give them these details. The password is not shown again (you can set a new one later).</p>
        <dl className="mt-4 space-y-2 rounded-xl bg-paper p-3.5 text-sm">
          {[
            ['Studio', studioLink()],
            ['Username', created.user.username],
            ['Password', created.password],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-ink-soft">{k}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <CopyButton text={details} label="Copy all" />
          <button type="button" onClick={() => onClose(`Added ${userName(created.user)}`)} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-stage-raised">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  const canSave = creating ? username.trim() && password.length >= 6 : password.length >= 6;
  return (
    <Modal label={creating ? 'Add user' : 'Edit user'} busy={busy} onClose={() => onClose()}>
      <form onSubmit={submit}>
        <p className="font-display text-xl font-semibold text-ink">{creating ? 'Add a user' : `Edit ${userName(user)}`}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {creating ? 'They sign in to the studio with this username and password. Every doctor they make is listed under them.' : 'Set a new password.'}
        </p>

        <label htmlFor="u-username" className="mt-4 block text-[13px] font-semibold text-ink">
          Username
        </label>
        <input
          id="u-username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
          placeholder="e.g. ravi"
          disabled={!creating}
          autoFocus={creating}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          className={field}
        />
        <p className="mt-1 text-xs text-ink-faint">{creating ? '3 to 32 letters, numbers, dots, dashes or underscores.' : 'The username cannot be changed.'}</p>

        <label htmlFor="u-pass" className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <KeyRound className="h-3.5 w-3.5" /> {creating ? 'Password' : 'New password'}
        </label>
        <div className="mt-1 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id="u-pass"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              autoFocus={!creating}
              className={`${fieldBase} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPassword(makePassword());
              setShow(true);
            }}
            className="shrink-0 rounded-xl border border-line px-3 text-[13px] font-semibold text-ink hover:border-ink/40"
          >
            Generate
          </button>
        </div>
        {!creating && password && <p className="mt-1 text-xs text-ink-faint">{userName(user)} will be signed out and must use the new password.</p>}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => onClose()} disabled={busy} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !canSave}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-stage-raised disabled:opacity-50"
          >
            {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
            {creating ? 'Add user' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "Delete user?" pop-up. Their doctors are kept and move to "No user". */
export function ConfirmDeleteUser({ user, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(user);
    } catch (err) {
      setError(err.message || 'Delete failed.');
      setBusy(false);
    }
  };
  return (
    <Modal role="alertdialog" label={`Delete ${userName(user)}?`} busy={busy} onClose={onCancel}>
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 font-display font-semibold text-red-700">{initials(user)}</span>
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold text-ink">Delete {userName(user)}?</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">@{user.username}</span> will no longer be able to sign in to the studio.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Their {user.doctors} doctor{user.doctors === 1 ? '' : 's'} {user.doctors === 1 ? 'is' : 'are'} kept and move to <span className="font-medium text-ink">No user</span>. To only
            stop them signing in, switch them to Inactive instead.
          </p>
        </div>
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} autoFocus className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {busy ? 'Deleting…' : 'Delete user'}
        </button>
      </div>
    </Modal>
  );
}
