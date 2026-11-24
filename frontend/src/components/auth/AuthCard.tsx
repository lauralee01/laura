'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { BrandLockup } from '@/components/BrandLockup';

/**
 * PREVIEW ONLY — visual mock of sign in / sign up. Nothing here talks to the
 * backend yet; submitting just shows a notice.
 */

type View = 'signin' | 'signup' | 'code';

const inputClass =
  'mt-1.5 w-full rounded-[var(--radius-md)] border border-border bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60';

const primaryButtonClass =
  'w-full cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 py-2.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50';

const linkButtonClass =
  'cursor-pointer text-xs font-medium text-accent underline-offset-2 transition hover:text-accent-hover hover:underline';

function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Not a wrapping <label>: buttons inside a label would hijack its control.
  return (
    <div className="text-left">
      <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
        <label htmlFor={id}>{label}</label>
        {hint}
      </div>
      {children}
    </div>
  );
}

export function AuthCard() {
  const [view, setView] = useState<View>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const switchView = (next: View) => {
    setView(next);
    setCodeSent(false);
    setShowPassword(false);
    setNotice(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (view === 'code' && !codeSent) {
      setCodeSent(true);
      setNotice(null);
      return;
    }
    setNotice(
      'Preview only: sign-in isn’t connected yet, so nothing was sent.',
    );
  };

  const title =
    view === 'signup'
      ? 'Create your account'
      : view === 'code'
        ? 'Sign in with a code'
        : 'Welcome back';

  const subtitle =
    view === 'signup'
      ? 'One account for your chats, memories, and settings on every device.'
      : view === 'code'
        ? codeSent
          ? 'We sent a 6-digit code to your email. Enter it below.'
          : 'No password needed. We’ll email you a one-time code.'
        : 'Sign in to pick up where you left off, on any device.';

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 text-ink">
      <div className="w-full max-w-[26rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLockup size="hero" />
          <p className="mt-3 text-sm text-ink-muted">
            Your personal assistant
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border-subtle bg-surface-elevated/90 p-6 shadow-soft md:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {view === 'signup' ? (
              <Field id="auth-name" label="Name">
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  className={inputClass}
                />
              </Field>
            ) : null}

            <Field id="auth-email" label="Email">
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled={view === 'code' && codeSent}
                className={`${inputClass} disabled:opacity-60`}
              />
            </Field>

            {view !== 'code' ? (
              <Field
                id="auth-password"
                label="Password"
                hint={
                  view === 'signin' ? (
                    <button
                      type="button"
                      className={linkButtonClass}
                      onClick={() =>
                        setNotice(
                          'Preview only: password reset isn’t built yet.',
                        )
                      }
                    >
                      Forgot password?
                    </button>
                  ) : null
                }
              >
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      view === 'signup' ? 'new-password' : 'current-password'
                    }
                    placeholder={
                      view === 'signup' ? 'At least 8 characters' : '••••••••'
                    }
                    className={`${inputClass} pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 mt-1.5 cursor-pointer px-3 text-xs font-medium text-ink-muted transition hover:text-ink"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
            ) : null}

            {view === 'code' && codeSent ? (
              <Field id="auth-code" label="6-digit code">
                <input
                  id="auth-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
                />
              </Field>
            ) : null}

            {notice ? (
              <p
                role="status"
                className="rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
              >
                {notice}
              </p>
            ) : null}

            <button type="submit" className={primaryButtonClass}>
              {view === 'signup'
                ? 'Create account'
                : view === 'code'
                  ? codeSent
                    ? 'Verify and sign in'
                    : 'Email me a code'
                  : 'Sign in'}
            </button>

            {view === 'code' && codeSent ? (
              <p className="text-center text-xs text-ink-muted">
                Didn’t get it?{' '}
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() =>
                    setNotice('Preview only: no code was actually sent.')
                  }
                >
                  Resend code
                </button>
              </p>
            ) : null}
          </form>

          {view !== 'code' ? (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border-subtle" />
                <span className="text-[11px] uppercase tracking-wide text-ink-muted">
                  or
                </span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>

              <button
                type="button"
                onClick={() =>
                  setNotice(
                    'Preview only: Google sign-in isn’t connected yet.',
                  )
                }
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-canvas px-3 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40"
              >
                <GoogleMark />
                Continue with Google
              </button>
            </>
          ) : null}

          <div className="mt-5 space-y-2 text-center text-xs text-ink-muted">
            {view === 'signin' ? (
              <>
                <p>
                  New to Laura?{' '}
                  <button
                    type="button"
                    className={linkButtonClass}
                    onClick={() => switchView('signup')}
                  >
                    Create an account
                  </button>
                </p>
                <p>
                  <button
                    type="button"
                    className={linkButtonClass}
                    onClick={() => switchView('code')}
                  >
                    Email me a code instead
                  </button>
                </p>
              </>
            ) : null}

            {view === 'signup' ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() => switchView('signin')}
                >
                  Sign in
                </button>
              </p>
            ) : null}

            {view === 'code' ? (
              <p>
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() => switchView('signin')}
                >
                  Use a password instead
                </button>
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-muted">
          By continuing, you agree to Laura’s{' '}
          <Link
            href="/terms"
            className="underline underline-offset-2 transition hover:text-ink"
          >
            Terms
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="underline underline-offset-2 transition hover:text-ink"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
