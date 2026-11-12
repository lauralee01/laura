export const SESSION_TONE_PRESETS = ['warm', 'concise', 'casual'] as const;

export type SessionTone = (typeof SESSION_TONE_PRESETS)[number];

export const DEFAULT_SESSION_TONE: SessionTone = 'warm';
export const DEFAULT_MEETING_MINUTES = 60;
export const MIN_MEETING_MINUTES = 15;
export const MAX_MEETING_MINUTES = 180;

export type SessionPrefs = {
  timeZone: string | null;
  location: string | null;
  tone: SessionTone;
  defaultMeetingMinutes: number;
};

export function isSessionTone(value: unknown): value is SessionTone {
  return (
    typeof value === 'string' &&
    (SESSION_TONE_PRESETS as readonly string[]).includes(value)
  );
}

export function normalizeMeetingMinutes(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) {
    return null;
  }
  const rounded = Math.round(n);
  if (rounded < MIN_MEETING_MINUTES || rounded > MAX_MEETING_MINUTES) {
    return null;
  }
  return rounded;
}
