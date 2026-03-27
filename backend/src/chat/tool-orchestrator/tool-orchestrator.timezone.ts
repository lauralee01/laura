import { IANAZone } from 'luxon';

/**
 * Pulls an IANA zone (e.g. America/Chicago) or UTC from free text.
 * Normalizes common lowercase user input to valid zone ids.
 */
export function extractTimeZoneFromMessage(message: string): string | null {
  const match = message.match(
    /\b([A-Za-z]+(?:\/[A-Za-z0-9_\+\-]+)+|UTC)\b/i,
  );
  const raw = match?.[1];
  if (!raw) return null;

  const candidate = raw.toUpperCase() === 'UTC' ? 'UTC' : raw;
  if (IANAZone.isValidZone(candidate)) return candidate;

  if (candidate.includes('/')) {
    const normalizeSegment = (seg: string): string => {
      const trimmed = seg.trim();
      const m = trimmed.match(/^([a-zA-Z]+)(.*)$/);
      if (!m) return trimmed;

      const prefixLower = m[1].toLowerCase();
      const rest = m[2];

      const prefix =
        prefixLower === 'gmt' || prefixLower === 'utc'
          ? prefixLower.toUpperCase()
          : prefixLower.charAt(0).toUpperCase() + prefixLower.slice(1);

      return prefix + rest;
    };

    const normalized = candidate
      .split('/')
      .map((seg) => normalizeSegment(seg))
      .join('/');

    if (IANAZone.isValidZone(normalized)) return normalized;
  }

  return null;
}

/** True if the user is answering our “what timezone?” prompt (not random prose). */
export function isTimeZoneSettingMessage(
  message: string,
  timeZone: string,
): boolean {
  const trimmed = message.trim();
  const lower = message.toLowerCase();
  if (trimmed.toLowerCase() === timeZone.toLowerCase()) return true;

  if (
    trimmed.toLowerCase().includes(timeZone.toLowerCase()) &&
    trimmed.length <= Math.max(48, timeZone.length + 24)
  ) {
    return true;
  }

  return (
    lower.includes('timezone') ||
    lower.includes('time zone') ||
    lower.includes('use ') ||
    lower.startsWith('use ') ||
    lower.includes('my time')
  );
}
