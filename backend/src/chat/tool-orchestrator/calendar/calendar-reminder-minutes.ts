/**
 * Parse human reminder lead times ("1 hour before", "30 minutes") into
 * Google Calendar popup minutes-before.
 */
export function parseReminderLeadMinutes(
  raw: string | null | undefined,
): number | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const text = raw.trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (
    /\b(0\s*min(?:ute)?s?|at (the )?start|when it starts|no lead)\b/.test(text)
  ) {
    return 0;
  }

  if (/\bhalf(?:\s+an)?\s+hour\b/.test(text)) {
    return 30;
  }

  if (/\b(?:an|one)\s+hour\b/.test(text)) {
    return 60;
  }

  const hours = text.match(/(\d+(?:\.\d+)?)\s*hours?\b/);
  if (hours) {
    const value = Number(hours[1]);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(value * 60));
    }
  }

  const minutes = text.match(/(\d+)\s*min(?:ute)?s?\b/);
  if (minutes) {
    const value = Number(minutes[1]);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
  }

  return null;
}

/** Prefer explicit minutes; fall back to parsing Stage-1 / free-text reminder. */
export function resolveReminderMinutesBefore(input: {
  extracted?: number | null;
  slotReminder?: unknown;
  userMessage?: string;
}): number | undefined {
  if (
    typeof input.extracted === 'number' &&
    Number.isFinite(input.extracted)
  ) {
    return Math.max(0, Math.floor(input.extracted));
  }

  const fromSlot =
    typeof input.slotReminder === 'string'
      ? parseReminderLeadMinutes(input.slotReminder)
      : null;
  if (fromSlot !== null) {
    return fromSlot;
  }

  const fromMessage = parseReminderLeadMinutes(input.userMessage);
  return fromMessage !== null ? fromMessage : undefined;
}
