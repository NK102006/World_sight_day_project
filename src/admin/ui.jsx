// Small pieces shared by the admin page's doctor and user sections.
import React, { useEffect, useRef } from 'react';

/** Active / Inactive switch (an accessible role="switch" toggle). */
export function ActiveSwitch({ active, busy, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!active)}
      className="group/switch inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-xs font-semibold disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${active ? 'bg-emerald-600' : 'bg-ink/25'}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${active ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
        />
      </span>
      <span className={active ? 'text-emerald-700' : 'text-ink-soft'}>{active ? 'Active' : 'Inactive'}</span>
    </button>
  );
}

/**
 * The page's own pop-up window. Esc and a click outside close it (unless busy).
 * One steady Esc listener for its lifetime, reading the latest props through a ref.
 */
export function Modal({ label, busy, onClose, children, role = 'dialog', width = 'max-w-md' }) {
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !latest.current.busy && latest.current.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stage/60 p-4" onClick={() => !busy && onClose()}>
      <div
        role={role}
        aria-modal="true"
        aria-label={label}
        className={`max-h-[calc(100vh-2rem)] w-full ${width} overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** "Dr. Name" for a doctor record. */
export const doctorName = (record, fallback = 'this doctor') =>
  record.doctorName ? (/^dr\.?\s/i.test(record.doctorName) ? record.doctorName : `Dr. ${record.doctorName}`) : fallback;

/** A user's shown name. */
export const userName = (user) => (user ? user.displayName || user.username : '');

/** Two-letter initials for a user's avatar. */
export const initials = (user) =>
  userName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
