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
 * Laura "speaks" in large typed text; the matching field appears underneath.
 * After the password step the user goes straight to the chat.
 */

type Step = 'email' | 'password';
type TypedLine = { text: string; className: string };

const BIG_LINE =
  'text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl';
const SUB_LINE = 'text-xl leading-snug text-ink-muted sm:text-3xl';

const STEP_LINES: Record<Step, TypedLine[]> = {
  email: [
    { text: "Hi, I'm laura, your personal assistant.", className: BIG_LINE },
    {
      text: 'Kindly give me your email to help you get started.',
      className: `mt-4 ${SUB_LINE}`,
    },
  ],
  password: [
    { text: 'Thank you.', className: BIG_LINE },
    {
      text: 'Please give me your password to help you get started.',
      className: `mt-4 ${SUB_LINE}`,
    },
  ],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_MS = 28;
const FIRST_LINE_START_MS = 500;
const NEXT_LINE_START_MS = 150;
const LINE_PAUSE_MS = 350;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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

export function ConversationalAuth() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [readyStep, setReadyStep] = useState<Step | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ready = readyStep === step;
  const isEmail = step === 'email';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) {
      return;
    }

    if (isEmail) {
      if (!EMAIL_RE.test(value.trim())) {
        setError("That doesn't look like an email yet. Could you check it?");
        return;
      }
      setError(null);
      setNotice(null);
      setValue('');
      setStep('password');
      return;
    }

    if (!value) {
      return;
    }
    // Preview only: no request is made. Straight into the chat.
    setSubmitting(true);
    setValue('');
    router.push('/');
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center px-6 pb-8 pt-[18vh] text-ink sm:pt-[22vh]">
      <div className="w-full max-w-2xl">
        <TypedLines
          key={step}
          lines={STEP_LINES[step]}
          onComplete={() => setReadyStep(step)}
        />

        {ready ? (
          <div className="laura-empty-enter mt-10">
            <form onSubmit={onSubmit} noValidate>
              <div className="laura-composer-shell flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-4 py-2 shadow-soft">
                <input
                  key={step}
                  type={isEmail ? 'email' : 'password'}
                  autoComplete={isEmail ? 'email' : 'current-password'}
                  inputMode={isEmail ? 'email' : undefined}
                  placeholder={isEmail ? 'you@example.com' : 'Your password'}
                  aria-label={isEmail ? 'Email' : 'Password'}
                  aria-invalid={error ? true : undefined}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  onKeyDown={enterSubmits}
                  disabled={submitting}
                  autoFocus
                  className="min-h-[2.75rem] min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-ink-muted"
                />
                <button
                  type="submit"
                  disabled={submitting || !value}
                  aria-label={isEmail ? 'Continue' : 'Sign in'}
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-accent text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <IconSend />
                </button>
              </div>
            </form>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() =>
                  setNotice(
                    'Google sign-in would open here. This is a preview, so nothing was sent.',
                  )
                }
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-elevated/60 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/40"
              >
                <GoogleMark />
                Or continue with Google
              </button>
            </div>

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
