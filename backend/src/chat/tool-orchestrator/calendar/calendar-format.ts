import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';

function formatTimeRange(e: ListCalendarEventSummary): string {
  if (e.isAllDay) {
    return `${e.startText}${e.endText ? ` to ${e.endText}` : ''} (All-day)`;
  }

  return `${e.startText}${e.endText ? `–${e.endText}` : ''}`;
}

export function formatCalendarEventLines(
  events: ListCalendarEventSummary[],
): string {
  return events
    .map((event) => `- ${event.title} — ${formatTimeRange(event)}`)
    .join('\n');
}