'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { IconSend } from '@/components/chat-ui/ChatIcons';
import { GoogleMark } from '@/components/auth/AuthCard';

/**
 * PREVIEW ONLY — conversational sign-in prototype. Nothing is sent anywhere.
 *
 * The outcomes below are FAKE rules so every path can be seen in the browser.
 * They are replaced by real backend checks when auth is wired up:
 *   - an email starting with "new" is treated as a brand-new account
 *   - for existing accounts, any password under 6 characters "doesn't match"
 *   - any 6-digit code is accepted
 */

type Step = 'email' | 'emailRetry' | 'password' | 'code' | 'create';
type TypedLine = { text: string; className: string };

const BIG_LINE =
  'text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl';
const SUB_LINE = 'text-xl leading-snug text-ink-muted sm:text-3xl';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_NEW_PASSWORD = 8;
const MIN_EXISTING_PASSWORD = 6; // preview rule only
const MAX_ATTEMPTS_BEFORE_CODE_HINT = 3;

const TYPE_MS = 28;
const FIRST_LINE_START_MS = 500;
const NEXT_LINE_START_MS = 150;
const LINE_PAUSE_MS = 350;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const primaryPillClass =
  'cursor-pointer rounded-[var(--radius-md)] bg-accent px-4 py-2.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50';
const secondaryPillClass =
  'cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface-elevated/60 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40';
const linkButtonClass =
  'cursor-pointer text-xs font-medium text-accent underline-offset-2 transition hover:text-accent-hover hover:underline';

function linesFor(step: Step, email: string): TypedLine[] {
  switch (step) {
    case 'email':
      return [
        { text: "Hi, I'm laura, your personal assistant.", className: BIG_LINE },
        {
          text: 'Kindly give me your email to help you get started.',
          className: `mt-4 ${SUB_LINE}`,
        },
      ];
    case 'emailRetry':
      return [
        {
          text: "No problem. What's the email you'd like to use?",
          className: BIG_LINE,
        },
      ];
    case 'password':
      return [
        { text: 'Thank you.', className: BIG_LINE },
        {
          text: 'Please give me your password to help you get started.',
          className: `mt-4 ${SUB_LINE}`,
        },
      ];
    case 'code':
      return [
        { text: "Let's get you back in.", className: BIG_LINE },
        {
          text: `I've emailed a 6-digit code to ${email}. Enter it here.`,
          className: `mt-4 ${SUB_LINE}`,
        },
      ];
    case 'create':
      return [
        { text: `I couldn't find an account for ${email}.`, className: BIG_LINE },
        {
          text: 'Would you like me to create one with this password?',
          className: `mt-4 ${SUB_LINE}`,
        },
      ];
  }
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Types out Laura's lines one after another as big text on the page.
 * The full text is exposed to screen readers immediately; the typing is
 * visual only. Calls onComplete once everything is on screen.
 */
function TypedLines({
  lines,
  onComplete,
}: {
  lines: TypedLine[];
  onComplete: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [lineIndex, setLineIndex] = useState(0);
  const [count, setCount] = useState(0);
  const handleComplete = useEffectEvent(() => onComplete());

  const allDone = reduceMotion || lineIndex >= lines.length;
  const current = allDone ? null : lines[lineIndex];
  const lineDone = current !== null && count >= current.text.length;

  useEffect(() => {
    if (allDone) {
      const timer = window.setTimeout(handleComplete, reduceMotion ? 0 : 150);
      return () => window.clearTimeout(timer);
    }

    const delay = lineDone
      ? LINE_PAUSE_MS
      : count === 0
        ? lineIndex === 0
          ? FIRST_LINE_START_MS
          : NEXT_LINE_START_MS
        : TYPE_MS;

    const timer = window.setTimeout(() => {
      if (lineDone) {
        setLineIndex((i) => i + 1);
        setCount(0);
      } else {
        setCount((c) => c + 1);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [allDone, lineDone, count, lineIndex, reduceMotion]);

  const skip = () => {
    setLineIndex(lines.length);
    setCount(0);
  };

  const finishedLines = allDone ? lines : lines.slice(0, lineIndex);

  return (
    <div>
      <h1 className="sr-only">{lines.map((l) => l.text).join(' ')}</h1>

      <div aria-hidden="true">
        {finishedLines.map((line) => (
          <p key={line.text} className={line.className}>
            {line.text}
          </p>
        ))}
        {current ? (
          <p className={current.className}>
            {current.text.slice(0, count)}
            <span className="ml-1 inline-block h-[0.85em] w-[0.12em] translate-y-[0.08em] rounded-sm bg-accent animate-pulse" />
          </p>
        ) : null}
      </div>

      {!allDone && (lineIndex > 0 || count > 0) ? (
        <button
          type="button"
          onClick={skip}
          className="mt-4 cursor-pointer text-xs text-ink-muted transition hover:text-ink"
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}

function enterSubmits(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-elevated/60 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/40"
    >
      <GoogleMark />
      Or continue with Google
    </button>
  );
}

export function ConversationalAuth() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [readyStep, setReadyStep] = useState<Step | null>(null);
  const [value, setValue] = useState('');
  const [email, setEmail] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ready = readyStep === step;
  const isEmailStep = step === 'email' || step === 'emailRetry';
  const showGoogle = isEmailStep || step === 'password';

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("That doesn't look like an email yet. Could you check it?");
      return;
    }
    clearMessages();
    setEmail(trimmed);
    setValue('');
    setAttempts(0);
    setStep('password');
  };

  const onPasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value) {
      return;
    }

    // PREVIEW rule: emails starting with "new" have no account yet.
    const isNewAccount = email.toLowerCase().startsWith('new');

    if (isNewAccount) {
      if (value.length < MIN_NEW_PASSWORD) {
        setError(
          `Use at least ${MIN_NEW_PASSWORD} characters so your account is secure.`,
        );
        return;
      }
      clearMessages();
      setValue('');
      setStep('create');
      return;
    }

    // PREVIEW rule: short passwords "don't match" for existing accounts.
    if (value.length < MIN_EXISTING_PASSWORD) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setValue('');
      setError(
        nextAttempts >= MAX_ATTEMPTS_BEFORE_CODE_HINT
          ? "That still doesn't match. Want me to email you a code instead?"
          : "That password didn't match. Try again?",
      );
      return;
    }

    // Signed in: straight into the chat, no confirmation screen.
    router.push('/');
  };

  const onCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(value.trim())) {
      setError('That code should be 6 digits.');
      return;
    }
    router.push('/');
  };

  const onForgot = () => {
    clearMessages();
    setValue('');
    setStep('code');
  };

  const onCreateAccount = () => {
    // Preview: a real backend would create the account here, then sign in.
    router.push('/');
  };

  const onUseDifferentEmail = () => {
    clearMessages();
    setValue('');
    setEmail('');
    setAttempts(0);
    setStep('emailRetry');
  };

  const onGoogle = () => {
    setNotice(
      'Google sign-in would open here. This is a preview, so nothing was sent.',
    );
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center px-6 pb-8 pt-[18vh] text-ink sm:pt-[22vh]">
      <div className="w-full max-w-2xl">
        <TypedLines
          key={step}
          lines={linesFor(step, email)}
          onComplete={() => setReadyStep(step)}
        />

        {ready && isEmailStep ? (
          <div className="laura-empty-enter mt-10">
            <form onSubmit={onEmailSubmit} noValidate>
              <div className="laura-composer-shell flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-4 py-2 shadow-soft">
                <input
                  key={step}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  aria-label="Email"
                  aria-invalid={error ? true : undefined}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={enterSubmits}
                  autoFocus
                  className="min-h-[2.75rem] min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-ink-muted"
                />
                <button
                  type="submit"
                  disabled={!value}
                  aria-label="Continue"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-accent text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconSend />
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {ready && step === 'password' ? (
          <div className="laura-empty-enter mt-10">
            <form onSubmit={onPasswordSubmit} noValidate>
              <div className="laura-composer-shell flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-4 py-2 shadow-soft">
                <input
                  key={step}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  aria-label="Password"
                  aria-invalid={error ? true : undefined}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={enterSubmits}
                  autoFocus
                  className="min-h-[2.75rem] min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-ink-muted"
                />
                <button
                  type="submit"
                  disabled={!value}
                  aria-label="Sign in"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-accent text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconSend />
                </button>
              </div>
            </form>

            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onForgot} className={linkButtonClass}>
                Forgot your password?
              </button>
            </div>
          </div>
        ) : null}

        {ready && step === 'code' ? (
          <div className="laura-empty-enter mt-10">
            <form onSubmit={onCodeSubmit} noValidate>
              <div className="laura-composer-shell flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-4 py-2 shadow-soft">
                <input
                  key={step}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  aria-label="6-digit code"
                  aria-invalid={error ? true : undefined}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={enterSubmits}
                  autoFocus
                  className="min-h-[2.75rem] min-w-0 flex-1 bg-transparent text-center font-mono text-lg tracking-[0.4em] text-ink outline-none placeholder:text-ink-muted"
                />
                <button
                  type="submit"
                  disabled={!value}
                  aria-label="Verify"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-accent text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconSend />
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {ready && step === 'create' ? (
          <div className="laura-empty-enter mt-10 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onCreateAccount}
              className={primaryPillClass}
            >
              Create my account
            </button>
            <button
              type="button"
              onClick={onUseDifferentEmail}
              className={secondaryPillClass}
            >
              Use a different email
            </button>
          </div>
        ) : null}

        {ready ? (
          <div className="mt-3">
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            {showGoogle ? (
              <div className="mt-5">
                <GoogleButton onClick={onGoogle} />
              </div>
            ) : null}

            {notice ? (
              <p role="status" className="mt-3 text-sm text-ink-muted">
                {notice}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-auto pt-12 text-center text-[11px] leading-relaxed text-ink-muted">
        By continuing, you agree to Laura&apos;s{' '}
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
    </main>
  );
}
