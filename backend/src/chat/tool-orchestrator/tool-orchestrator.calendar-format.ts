import type { ListCalendarEventSummary } from '../../integrations/calendar/calendar.types';

export function formatCalendarEventLines(
  events: ListCalendarEventSummary[],
): string {
  return events
    .map((e) =>
      e.isAllDay
        ? `- ${e.title} — ${e.startText}${
            e.endText ? ` to ${e.endText}` : ''
          } (All-day)`
        : `- ${e.title} — ${e.startText}${
            e.endText ? `–${e.endText}` : ''
          }`,
    )
    .join('\n');
}
