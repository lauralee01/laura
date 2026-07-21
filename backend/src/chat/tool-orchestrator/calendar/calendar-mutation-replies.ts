import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';

const GENERIC_TITLE_FILTERS = new Set([
  '',
  'any',
  '*',
  'unspecified',
  'meeting',
  'event',
  'appointment',
]);

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Extracts clock time hints (e.g. "3pm", "3:00", "15:00") from keyword string.
 */
function parseTimeHintFromKeywords(titleKeywords: string): {
  targetHour12?: number;
  isPm?: boolean;
  rawTimeToken?: string;
  cleanedKeywords: string;
} {
  let cleaned = titleKeywords.toLowerCase();

  const timeMatch = cleaned.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  let targetHour12: number | undefined;
  let isPm: boolean | undefined;
  let rawTimeToken: string | undefined;

  if (timeMatch) {
    const hourNum = parseInt(timeMatch[1], 10);
    if (hourNum >= 1 && hourNum <= 24) {
      if (timeMatch[3]) {
        targetHour12 = hourNum > 12 ? hourNum - 12 : hourNum;
        isPm = timeMatch[3].toLowerCase() === 'pm';
        rawTimeToken = timeMatch[0];
      } else if (timeMatch[2] || hourNum > 12) {
        targetHour12 = hourNum > 12 ? hourNum - 12 : hourNum;
        isPm = hourNum >= 12;
        rawTimeToken = timeMatch[0];
      }
    }
  }

  if (rawTimeToken) {
    cleaned = cleaned.replace(rawTimeToken, ' ').trim();
  }

  return {
    targetHour12,
    isPm,
    rawTimeToken,
    cleanedKeywords: cleaned,
  };
}

function eventMatchesTimeHint(
  event: ListCalendarEventSummary,
  targetHour12?: number,
  isPm?: boolean,
): boolean {
  if (targetHour12 === undefined) return true;

  if (event.startLocalIso) {
    const timePart = event.startLocalIso.split('T')[1];
    if (timePart) {
      const hour = parseInt(timePart.split(':')[0], 10);
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      const eventIsPm = hour >= 12;

      if (isPm !== undefined) {
        if (hour12 === targetHour12 && eventIsPm === isPm) return true;
      } else {
        if (hour12 === targetHour12) return true;
      }
    }
  }

  if (event.startText) {
    const startLower = event.startText.toLowerCase();
    if (startLower.includes(`${targetHour12}`)) return true;
  }

  return false;
}

export function filterEventsForMutation(
  events: ListCalendarEventSummary[],
  titleKeywords: string,
): ListCalendarEventSummary[] {
  const normalizedKeywords = normalizeTitle(titleKeywords);

  if (GENERIC_TITLE_FILTERS.has(normalizedKeywords)) {
    return events;
  }

  const { targetHour12, isPm, cleanedKeywords } =
    parseTimeHintFromKeywords(titleKeywords);

  const normalizedCleaned = normalizeTitle(cleanedKeywords);
  const words = normalizedCleaned
    .split(/\s+/)
    .filter((w) => w && !GENERIC_TITLE_FILTERS.has(w));

  const filtered = events.filter((event) => {
    if (targetHour12 !== undefined) {
      if (!eventMatchesTimeHint(event, targetHour12, isPm)) {
        return false;
      }
    }

    if (words.length > 0) {
      const normalizedTitle = normalizeTitle(event.title);
      const titleMatches = words.some((word) =>
        normalizedTitle.includes(word),
      );
      if (!titleMatches) return false;
    }

    return true;
  });

  if (filtered.length === 0 && events.length > 0 && words.length > 0) {
    const fallback = events.filter((event) => {
      const normalizedTitle = normalizeTitle(event.title);
      return words.some((word) => normalizedTitle.includes(word));
    });
    if (fallback.length > 0) return fallback;
  }

  return filtered.length > 0 ? filtered : events;
}
