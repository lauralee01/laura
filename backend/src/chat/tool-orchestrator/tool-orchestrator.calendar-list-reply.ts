import { DateTime } from 'luxon';
import type { ListCalendarEventSummary } from '../../integrations/calendar/calendar.types';
import type { CalendarListMode } from './tool-orchestrator.types';
import { formatCalendarEventLines } from './tool-orchestrator.calendar-format';
import {
  describeDayWindow,
  formatMonToSunRange,
  formatMonthWindowLabel,
  formatYearWindowLabel,
} from './tool-orchestrator.calendar-ranges';

/**
 * Builds a single user-visible reply for calendar list results (direct or after TZ resume).
 */
export function buildCalendarListUserMessage(params: {
  mode: CalendarListMode;
  timeZone: string;
  nowLocal: DateTime;
  weekOffset: number;
  dayOffset: number;
  monthOffset: number;
  yearOffset: number;
  maxEventsDefault: number;
  events: ListCalendarEventSummary[];
}): string {
  const {
    mode,
    timeZone,
    nowLocal,
    weekOffset,
    dayOffset,
    monthOffset,
    yearOffset,
    maxEventsDefault,
    events,
  } = params;

  if (mode === 'past') {
    const max = maxEventsDefault;
    const recent = events.slice(-max).reverse();
    if (recent.length === 0) {
      return `No past events found in ${timeZone} (searched about the last year up to now).`;
    }
    return (
      `Here are your last ${recent.length} events (${timeZone}), most recent first:\n\n` +
      formatCalendarEventLines(recent)
    );
  }

  if (events.length === 0) {
    if (mode === 'week') {
      return `No events found for that Mon–Sun week in ${timeZone}.`;
    }
    if (mode === 'month') {
      const label = formatMonthWindowLabel(nowLocal, monthOffset);
      return `No events found for ${label} in ${timeZone}.`;
    }
    if (mode === 'year') {
      const label = formatYearWindowLabel(nowLocal, yearOffset);
      return `No events found for ${label} in ${timeZone}.`;
    }
    if (mode === 'day') {
      return `No events found for ${describeDayWindow(nowLocal, dayOffset)} in ${timeZone}.`;
    }
    return `No upcoming events found in ${timeZone}.`;
  }

  if (mode === 'week') {
    const range = formatMonToSunRange(nowLocal, weekOffset);
    return (
      `Here are your events for ${range} (${timeZone}):\n\n` +
      formatCalendarEventLines(events)
    );
  }

  if (mode === 'month') {
    const label = formatMonthWindowLabel(nowLocal, monthOffset);
    return (
      `Here are your events for ${label} (${timeZone}):\n\n` +
      formatCalendarEventLines(events)
    );
  }

  if (mode === 'year') {
    const label = formatYearWindowLabel(nowLocal, yearOffset);
    return (
      `Here are your events for ${label} (${timeZone}):\n\n` +
      formatCalendarEventLines(events)
    );
  }

  if (mode === 'day') {
    const dayText = describeDayWindow(nowLocal, dayOffset);
    return (
      `Here are your events for ${dayText} (${timeZone}):\n\n` +
      formatCalendarEventLines(events)
    );
  }

  return (
    `Here are your next ${maxEventsDefault} events (${timeZone}):\n\n` +
    formatCalendarEventLines(events)
  );
}
