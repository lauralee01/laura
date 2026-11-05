'use client';

import { BrandLockup } from '@/components/BrandLockup';

const SUGGESTIONS = [
  {
    id: 'calendar',
    label: 'This week’s calendar',
    prompt: 'What’s on my calendar this week?',
  },
  {
    id: 'email',
    label: 'Draft an email',
    prompt: 'Help me draft a short email',
  },
  {
    id: 'web',
    label: 'Search the web',
    prompt: 'Search the web for ',
  },
  {
    id: 'chat',
    label: 'Just talk',
    prompt: 'I could use a quick sounding board',
  },
] as const;

type Props = {
  onSuggestion: (prompt: string) => void;
  disabled?: boolean;
};

export function ChatEmptyState({ onSuggestion, disabled }: Props) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-2 py-10 text-center md:py-16">
      <BrandLockup size="hero" className="justify-center" />
      <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted md:text-lg">
        What can I take care of today?
      </p>
      <ul className="mt-8 flex w-full flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(item.prompt)}
              className="rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3.5 py-2 text-sm text-ink shadow-soft transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
