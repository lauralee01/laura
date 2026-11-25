'use client';

import Link from 'next/link';
import {
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { GoogleMark } from '@/components/auth/AuthCard';

/**
 * PREVIEW ONLY — conversational sign-in prototype. Nothing is sent anywhere.
 * Passwords are never shown as text (they appear as dots in the transcript).
 */

type Step = 'email' | 'password' | 'code' | 'signing';
type Line = { id: number; text: string };
type Message = Line & { from: 'laura' | 'user' };

type State = {
  messages: Message[];
  queue: Line[];
  typing: Line | null;
  nextId: number;
};

type Action =
  | { type: 'say'; texts: string[] }
  | { type: 'user'; text: string }
  | { type: 'finishLine' }
  | { type: 'reset' };

const INTRO = [
  "Hi, I'm laura.",
  "I'm your personal assistant. I'm here to help you get through your day.",
  "What's your email?",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_MS = 24;
const FIRST_CHAR_MS = 450;
const LINE_PAUSE_MS = 300;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const inputClass =
  'w-full rounded-[var(--radius-md)] border border-border bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60';

const primaryButtonClass =
  'w-full cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 py-2.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50';

const linkButtonClass =
  'cursor-pointer text-xs font-medium text-accent underline-offset-2 transition hover:text-accent-hover hover:underline';

/* ---------- state: a tiny queue so Laura's lines type out one at a time ---------- */

function startNext(s: State): State {
  if (s.typing !== null || s.queue.length === 0) {
    return s;
  }
  const [first, ...rest] = s.queue;
  return { ...s, typing: first, queue: rest };
}

function initialState(): State {
  return startNext({
    messages: [],
    queue: INTRO.map((text, id) => ({ id, text })),
    typing: null,
    nextId: INTRO.length,
  });
}

function reducer(s: State, action: Action): State {
  switch (action.type) {
    case 'say':
      return startNext({
        ...s,
        queue: [
          ...s.queue,
          ...action.texts.map((text, i) => ({ id: s.nextId + i, text })),
        ],
        nextId: s.nextId + action.texts.length,
      });
    case 'user':
      return {
        ...s,
        messages: [
          ...s.messages,
          { id: s.nextId, text: action.text, from: 'user' },
        ],
        nextId: s.nextId + 1,
      };
    case 'finishLine':
      if (!s.typing) {
        return s;
      }
      return startNext({
        ...s,
        messages: [...s.messages, { ...s.typing, from: 'laura' }],
        typing: null,
      });
    case 'reset':
      return initialState();
  }
}

/* ---------- accessibility + motion ---------- */

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

/* ---------- bubbles ---------- */

function LauraBubble({ children }: { children: ReactNode }) {
  return (
    <div className="laura-message-enter flex justify-start">
      <div className="max-w-[85%] rounded-[var(--radius-lg)] bg-surface-elevated/90 px-4 py-2.5 text-sm leading-relaxed text-ink shadow-soft">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="laura-message-enter flex justify-end">
      <div className="max-w-[85%] break-words rounded-[var(--radius-lg)] bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-ink">
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-hidden="true">
      <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
      <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
      <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
    </span>
  );
}

/**
 * One of Laura's lines, typed out character by character. The full text stays
 * in the DOM for screen readers; the visible typing is hidden from them.
 */
function TypingLine({ text, onDone }: { text: string; onDone: () => void }) {
  const reduceMotion = usePrefersReducedMotion();
  const [count, setCount] = useState(0);
  const finished = reduceMotion || count >= text.length;

  // Reading the latest callback from an effect event keeps the typing timer
  // from restarting on every parent render.
  const handleDone = useEffectEvent(() => onDone());

  useEffect(() => {
    const delay = finished
      ? reduceMotion
        ? 0
        : LINE_PAUSE_MS
      : count === 0
        ? FIRST_CHAR_MS
        : TYPE_MS;
    const timer = window.setTimeout(() => {
      if (finished) {
        handleDone();
      } else {
        setCount((c) => c + 1);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [count, finished, reduceMotion]);

  const visible = finished ? text : text.slice(0, count);
  const showDots = !finished && count === 0;

  return (
    <>
      <LauraBubble>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {showDots ? (
            <TypingDots />
          ) : (
            <>
              {visible}
              {finished ? null : (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] rounded-sm bg-accent animate-pulse" />
              )}
            </>
          )}
        </span>
      </LauraBubble>
      {!finished && count > 0 ? (
        <div className="-mt-1 flex justify-start">
          <button
            type="button"
            onClick={() => setCount(text.length)}
            className="cursor-pointer px-1 text-[11px] text-ink-muted transition hover:text-ink"
          >
            Skip
          </button>
        </div>
      ) : null}
    </>
  );
}

/* ---------- controls ---------- */

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="laura-message-enter rounded-[var(--radius-lg)] border border-border-subtle bg-surface-elevated/90 p-4 shadow-soft">
      {children}
    </div>
  );
}

function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">
        or
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-canvas px-3 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40"
    >
      <GoogleMark />
      Continue with Google
    </button>
  );
}

/* ---------- main ---------- */

export function ConversationalAuth() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [step, setStep] = useState<Step>('email');
  const [value, setValue] = useState('');
  const [email, setEmail] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  const inputReady = state.typing === null && state.queue.length === 0;
  const signedIn = step === 'signing' && inputReady;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [state.messages.length, state.typing, inputReady, step, reduceMotion]);

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!EMAIL_RE.test(trimmed)) {
      dispatch({
        type: 'say',
        texts: ["That doesn't look like an email yet. Could you check it?"],
      });
      return;
    }
    setEmail(trimmed);
    setValue('');
    setStep('password');
    dispatch({ type: 'user', text: trimmed });
    dispatch({
      type: 'say',
      texts: ['Thanks. Enter your password to continue.'],
    });
  };

  const onPasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value) {
      return;
    }
    setValue('');
    setStep('signing');
    dispatch({ type: 'user', text: '••••••••' });
    dispatch({
      type: 'say',
      texts: ['Perfect. Signing you in…', "You're all set."],
    });
  };

  const onCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      dispatch({
        type: 'say',
        texts: ['That code should be 6 digits. Try again?'],
      });
      return;
    }
    setValue('');
    setStep('signing');
    dispatch({ type: 'user', text: trimmed });
    dispatch({
      type: 'say',
      texts: ['Code accepted. Signing you in…', "You're all set."],
    });
  };

  const onEmailCode = () => {
    setValue('');
    setStep('code');
    dispatch({ type: 'user', text: 'Email me a code instead' });
    dispatch({
      type: 'say',
      texts: [
        `No problem. I'll send a 6-digit code to ${email}. Type it here when it arrives.`,
      ],
    });
  };

  const onGoogle = () => {
    dispatch({ type: 'user', text: 'Continue with Google' });
    dispatch({
      type: 'say',
      texts: [
        'Google sign-in would open here. This is a preview, so nothing was sent.',
      ],
    });
  };

  const onReset = () => {
    dispatch({ type: 'reset' });
    setStep('email');
    setValue('');
    setEmail('');
  };

  let controls: ReactNode = null;

  if (signedIn) {
    controls = (
      <Card>
        <p className="text-sm text-ink">
          You&apos;re signed in as <strong>{email}</strong>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 py-2 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover"
          >
            Continue to chat
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/40"
          >
            Start over
          </button>
        </div>
        <p className="mt-3 text-[11px] text-ink-muted">
          Preview only. Nothing was saved.
        </p>
      </Card>
    );
  } else if (inputReady && step === 'email') {
    controls = (
      <Card>
        <form onSubmit={onEmailSubmit} className="space-y-3" noValidate>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            aria-label="Email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className={inputClass}
          />
          <button type="submit" className={primaryButtonClass}>
            Continue
          </button>
        </form>
        <OrDivider />
        <GoogleButton onClick={onGoogle} />
      </Card>
    );
  } else if (inputReady && step === 'password') {
    controls = (
      <Card>
        <form onSubmit={onPasswordSubmit} className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-label="Password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
            className={inputClass}
          />
          <button type="submit" className={primaryButtonClass}>
            Continue
          </button>
        </form>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onEmailCode} className={linkButtonClass}>
            Email me a code instead
          </button>
        </div>
        <OrDivider />
        <GoogleButton onClick={onGoogle} />
      </Card>
    );
  } else if (inputReady && step === 'code') {
    controls = (
      <Card>
        <form onSubmit={onCodeSubmit} className="space-y-3" noValidate>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            aria-label="6-digit code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
          />
          <button type="submit" className={primaryButtonClass}>
            Verify and continue
          </button>
        </form>
      </Card>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLockup size="md" />
        </div>

        <div className="flex flex-col gap-3">
          {state.messages.map((m) =>
            m.from === 'laura' ? (
              <LauraBubble key={m.id}>{m.text}</LauraBubble>
            ) : (
              <UserBubble key={m.id}>{m.text}</UserBubble>
            ),
          )}
          {state.typing ? (
            <TypingLine
              key={state.typing.id}
              text={state.typing.text}
              onDone={() => dispatch({ type: 'finishLine' })}
            />
          ) : null}
        </div>

        <div ref={bottomRef} className="mt-4">
          {controls}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-muted">
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
      </div>
    </main>
  );
}
