import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';

const GENERIC_TITLE_FILTERS = new Set([
  '',
  'any',
  '*',
  'unspecified',
]);

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function filterEventsForMutation(
  events: ListCalendarEventSummary[],
  titleKeywords: string,
): ListCalendarEventSummary[] {
  const normalizedKeywords = normalizeTitle(titleKeywords);

  if (GENERIC_TITLE_FILTERS.has(normalizedKeywords)) {
    return events;
  }

  const keywords = normalizedKeywords.split(/\s+/);

  return events.filter((event) => {
    const normalizedTitle = normalizeTitle(event.title);

    return keywords.every((keyword) =>
      normalizedTitle.includes(keyword),
    );
  });
}
