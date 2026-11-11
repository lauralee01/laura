'use client';

import { BrandLockup } from '@/components/BrandLockup';

type SuggestionAction = 'send' | 'fill';

const SUGGESTIONS: Array<{
  id: string;
  label: string;
  prompt: string;
  action: SuggestionAction;
}> = [
  {
    id: 'briefing',
    label: 'Morning briefing',
    prompt: "What's my morning briefing?",
    action: 'send',
  },
  {
    id: 'calendar',
    label: "This week's calendar",
    prompt: "What's on my calendar this week?",
    action: 'fill',
  },
  {
    id: 'email',
    label: 'Draft an email',
    prompt: 'Help me draft a short email',
    action: 'fill',
  },
  {
    id: 'web',
    label: 'Search the web',
    prompt: 'Search the web for ',
    action: 'fill',
  },
  {
    id: 'chat',
    label: 'Just talk',
    prompt: 'I could use a quick sounding board',
    action: 'fill',
  },
];

type Props = {
  onSuggestion: (prompt: string) => void;
  onSendSuggestion?: (prompt: string) => void;
  disabled?: boolean;
};

export function ChatEmptyState({
  onSuggestion,
  onSendSuggestion,
  disabled,
}: Props) {
  return (
    <div className="laura-empty-enter mx-auto flex max-w-2xl flex-col items-center px-2 py-10 text-center md:py-16">
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
              onClick={() => {
                if (item.action === 'send' && onSendSuggestion) {
                  onSendSuggestion(item.prompt);
                  return;
                }
                onSuggestion(item.prompt);
              }}
              className="laura-chip rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3.5 py-2 text-sm text-ink shadow-soft hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
