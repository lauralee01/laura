'use client';

import { useEffect, useState } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { fetchAccountabilityNudge } from '@/lib/chat-api';

type SuggestionAction = 'send' | 'fill';

type Suggestion = {
  id: string;
  label: string;
  prompt: string;
  action: SuggestionAction;
};

const MORNING_BRIEFING: Suggestion = {
  id: 'briefing',
  label: 'Morning briefing',
  prompt: "What's my morning briefing?",
  action: 'send',
};

const EVENING_WIND_DOWN: Suggestion = {
  id: 'wind-down',
  label: 'Evening wind-down',
  prompt: 'Help me with an evening wind-down',
  action: 'send',
};

const WEEKLY_REVIEW: Suggestion = {
  id: 'weekly-review',
  label: 'Weekly review',
  prompt: 'Help me with a weekly review',
  action: 'send',
};

const BASE_SUGGESTIONS: Suggestion[] = [
  {
    id: 'calendar',
    label: "This week's calendar",
    prompt: "What's on my calendar this week?",
    action: 'fill',
  },
  {
    id: 'writing',
    label: 'Write something',
    prompt: 'Help me write a ',
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

/**
 * Local hour → matching daily ritual first.
 * Fri–Sun (day 5/6/0) → weekly review leads the ritual chips.
 * Optional accountability nudge leads everything (at most one).
 */
export function buildEmptyStateSuggestions(
  hour = new Date().getHours(),
  day = new Date().getDay(),
  accountability?: Suggestion | null,
): Suggestion[] {
  const dailyRitual =
    hour >= 17 || hour < 5
      ? [EVENING_WIND_DOWN, MORNING_BRIEFING]
      : [MORNING_BRIEFING, EVENING_WIND_DOWN];

  const isWeekendReviewWindow = day === 5 || day === 6 || day === 0;
  const ritualFirst = isWeekendReviewWindow
    ? [WEEKLY_REVIEW, ...dailyRitual]
    : [...dailyRitual, WEEKLY_REVIEW];

  const base = [...ritualFirst, ...BASE_SUGGESTIONS];
  if (accountability) {
    return [accountability, ...base];
  }
  return base;
}

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
  const [accountability, setAccountability] = useState<Suggestion | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    void fetchAccountabilityNudge()
      .then((nudge) => {
        if (cancelled || !nudge) {
          return;
        }
        setAccountability({
          id: `accountability-${nudge.memoryId}`,
          label: nudge.label,
          prompt: nudge.prompt,
          action: 'send',
        });
      })
      .catch(() => {
        /* Soft feature — empty state still works without it. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = buildEmptyStateSuggestions(
    undefined,
    undefined,
    accountability,
  );

  return (
    <div className="laura-empty-enter mx-auto flex max-w-2xl flex-col items-center px-2 py-10 text-center md:py-16">
      <BrandLockup size="hero" className="justify-center" />
      <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted md:text-lg">
        What can I take care of today?
      </p>
      <ul className="mt-8 flex w-full flex-wrap items-center justify-center gap-2">
        {suggestions.map((item) => (
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
