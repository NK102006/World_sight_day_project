import React from 'react';
import { LogOut, UserPlus } from 'lucide-react';

// Letterhead-style header: logo, "Eye Shade Studio", "World Sight Day", and the account buttons.
// A coral heartbeat line runs along the rule underneath; it redraws (one pulse) every time
// `pulse` changes, i.e. whenever the portrait is updated.
// account (signed-in user): shows who is signed in, "Next doctor" and "Sign out".
export default function Header({ account, pulse }) {
  const user = account?.user;
  return (
    <div className="fx-drop relative z-30 px-4 pt-4 sm:px-6 lg:px-8">
      <header className="relative mx-auto flex max-w-[1280px] items-center justify-between gap-3 border-b-2 border-ink pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
              <path d="M2 16 Q16 3 30 16 Q16 29 2 16 Z" fill="#F4F0E6" />
              <circle cx="16" cy="16" r="6.5" fill="#3FA7D6" />
              <circle cx="16" cy="16" r="2.8" fill="#0F2A2E" />
              <circle cx="14.2" cy="14.2" r="1.1" fill="#fff" />
            </svg>
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-xl font-semibold sm:text-[22px]">
              Eye Shade Studio
            </p>
            <p className="mt-0.5 truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
              World Sight Day
            </p>
          </div>
        </div>
        {user && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={account.onNewDoctor}
              title="Start a portrait for another doctor"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-bold text-white transition-colors hover:bg-teal sm:px-4"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Next doctor</span>
              <span className="sr-only sm:hidden">Next doctor</span>
            </button>
            <button
              type="button"
              onClick={account.onSignOut}
              title="Sign out"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 text-[13px] font-bold text-ink transition-colors hover:bg-ink/[0.06] sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
              <span className="sr-only sm:hidden">Sign out</span>
            </button>
          </div>
        )}

        {/* Heartbeat on the rule (decorative) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -bottom-[21px] right-0 hidden h-10 w-1/2 md:block"
        >
          <path
            key={pulse}
            pathLength="1"
            className="fx-ecg"
            d="M0 20 H90 l10 -15 l12 30 l10 -24 l8 9 H600"
            fill="none"
            stroke="#FF6B4A"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </header>
    </div>
  );
}
