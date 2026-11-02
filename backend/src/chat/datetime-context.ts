/**
 * Grounded local datetime helpers for routing and general-chat prompts.
 */

export function resolveSessionTimeZone(
  sessionTz?: string | null,
  fallback = 'America/Chicago',
): string {
  const trimmed = sessionTz?.trim();
  return trimmed || fallback;
}

export function formatCurrentDateTime(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(at);
}

/** Calendar date YYYY-MM-DD in the given IANA zone. */
export function formatLocalDateIso(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    return at.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

/** System-prompt block so general chat can answer date math accurately. */
export function buildGroundedDateTimeContext(
  sessionTz?: string | null,
  at = new Date(),
): string {
  const timeZone = resolveSessionTimeZone(sessionTz);
  const formatted = formatCurrentDateTime(timeZone, at);
  const localDate = formatLocalDateIso(timeZone, at);

  return (
    `\n\nGrounded time context (authoritative — use this for any date or time reasoning):\n` +
    `- IANA timezone: ${timeZone}\n` +
    `- Current local datetime: ${formatted}\n` +
    `- Today's date: ${localDate}\n` +
    `When the user asks how many days are left in the year, countdowns, or similar date math, ` +
    `compute from Today's date above. Do not invent a different "today".`
  );
}
