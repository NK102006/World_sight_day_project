// ============================================================================
// StudioGate.jsx
// Sign-in before the studio. Users are created by the admin on the admin page
// (admin -> users -> doctors); every doctor a user makes belongs to them.
//
//   /studio/              sign-in page, then the studio for the signed-in user
//   /studio/?edit=<id>    the admin's editing mode: no user sign-in (the admin's
//                         own sign-in is checked by the admin API)
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LogIn } from 'lucide-react';
import App from './App';
import { getMe, signIn, signOut, newDoctor, setSignedOutHandler } from './services/eventStore';

const EDIT_MODE = new URLSearchParams(window.location.search).has('edit');

/** Small eye logo, the same as the studio header's. */
function Logo() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink">
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
        <path d="M2 16 Q16 3 30 16 Q16 29 2 16 Z" fill="#F4F0E6" />
        <circle cx="16" cy="16" r="6.5" fill="#3FA7D6" />
        <circle cx="16" cy="16" r="2.8" fill="#0F2A2E" />
        <circle cx="14.2" cy="14.2" r="1.1" fill="#fff" />
      </svg>
    </span>
  );
}

function Card({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="fx-rise w-full max-w-sm">{children}</div>
    </div>
  );
}

function SignInPage({ notice, onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn(username.trim(), password);
    setBusy(false);
    if (res.ok) return onSignedIn(res.user);
    setPassword('');
    setError(
      res.status === 429
        ? 'Too many wrong attempts. Wait 10 minutes and try again.'
        : res.status === 403
          ? 'This account is inactive. Ask the admin to turn it back on.'
          : res.status === 401
            ? 'Wrong username or password.'
            : 'Could not reach the server. Is it running?'
    );
  };

  return (
    <Card>
      <form onSubmit={submit} className="rounded-[24px] border-[1.5px] border-line bg-card p-6 shadow-[0_30px_60px_-30px_rgba(15,42,46,0.35)] sm:p-7">
        <div className="flex items-center justify-between">
          <Logo />
        </div>
        <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-teal">Staff entrance</p>
        <h1 className="mt-1.5 font-display text-[1.85rem] font-semibold leading-tight text-ink">
          Clocking in, <em className="text-teal">doctor?</em>
        </h1>
        <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-soft">Sign in with the username and password the admin gave you.</p>

        {notice && <p className="mt-4 rounded-xl bg-mint px-3.5 py-2.5 text-sm font-semibold text-ink">{notice}</p>}

        <label htmlFor="user-name" className="mt-5 block text-[13px] font-extrabold text-ink">
          Username
        </label>
        <input
          id="user-name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          className="mt-1 w-full rounded-[14px] border-[1.5px] border-line bg-white px-3.5 py-2.5 text-[15px] font-semibold outline-none focus:border-teal"
        />
        <label htmlFor="user-pass" className="mt-4 block text-[13px] font-extrabold text-ink">
          Password
        </label>
        <div className="relative mt-1">
          <input
            id="user-pass"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-[14px] border-[1.5px] border-line bg-white py-2.5 pl-3.5 pr-11 text-[15px] font-semibold outline-none focus:border-teal"
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
          {busy ? 'Signing in…' : 'Clock in'}
        </button>
        <p className="mt-4 text-center text-xs font-medium text-ink-faint">No account? Ask the admin to create one for you.</p>
      </form>
      <a href="../" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </a>
    </Card>
  );
}

export default function StudioGate() {
  const [state, setState] = useState(EDIT_MODE ? { view: 'studio' } : { view: 'checking' });
  const [doctorKey, setDoctorKey] = useState(0); // bumped by "New doctor": the studio starts fresh

  const check = useCallback(async () => {
    const me = await getMe();
    if (!me.ok) return setState({ view: 'no-server' });
    setState(me.signedIn ? { view: 'studio', user: me.user } : { view: 'sign-in' });
  }, []);

  useEffect(() => {
    if (EDIT_MODE) return;
    check();
    // The server ended the sign-in (expired, password changed, account made inactive)
    setSignedOutHandler(() => setState({ view: 'sign-in', notice: 'Your sign-in has ended. Please sign in again.' }));
  }, [check]);

  if (EDIT_MODE) return <App />;
  if (state.view === 'checking') return <div className="min-h-screen bg-paper" />;
  if (state.view === 'no-server')
    return (
      <Card>
        <div className="rounded-[24px] border-[1.5px] border-line bg-card p-6">
          <Logo />
          <p className="mt-4 font-display text-2xl font-semibold text-ink">The studio needs its server</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Sign-in could not be checked. In the <code className="rounded bg-paper px-1 font-mono text-[13px]">eye_shade_studio_project</code> folder run{' '}
            <code className="rounded bg-paper px-1 font-mono text-[13px]">npm run dev</code>, then reload this page.
          </p>
          <button type="button" onClick={check} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      </Card>
    );
  if (state.view === 'sign-in')
    return <SignInPage notice={state.notice} onSignedIn={(user) => { setDoctorKey((k) => k + 1); setState({ view: 'studio', user }); }} />;

  const account = {
    user: state.user,
    onNewDoctor: () => {
      newDoctor();
      setDoctorKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onSignOut: async () => {
      await signOut();
      setState({ view: 'sign-in' });
    },
  };
  return <App key={doctorKey} account={account} />;
}
