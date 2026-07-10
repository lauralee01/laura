import { DateTime } from 'luxon';
import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';
import type { CalendarListMode } from '../tool-orchestrator.types';
import { formatCalendarEventLines } from './calendar-format';
import {
  describeDayWindow,
  describeNextDaysSpan,
  formatMonToSunRange,
  formatMonthWindowLabel,
  formatYearWindowLabel,
} from './calendar-ranges';

type CalendarListMessageParams = {
  mode: CalendarListMode;
  nowLocal: DateTime;
  weekOffset: number;
  dayOffset: number;
  monthOffset: number;
  yearOffset: number;
  spanDays?: number;
  maxEventsDefault: number;
  events: ListCalendarEventSummary[];
};

function getWindowLabel(
  params: CalendarListMessageParams,
): string | null {
  const {
    mode,
    nowLocal,
    weekOffset,
    dayOffset,
    monthOffset,
    yearOffset,
    spanDays = 2,
  } = params;

  switch (mode) {
    case 'week':
      return formatMonToSunRange(nowLocal, weekOffset);

    case 'month':
      return formatMonthWindowLabel(nowLocal, monthOffset);

    case 'year':
      return formatYearWindowLabel(nowLocal, yearOffset);

    case 'day':
      return describeDayWindow(nowLocal, dayOffset);

    case 'next_days':
      return describeNextDaysSpan(spanDays);

    default:
      return null;
  }
}

function getEmptyCalendarMessage(
  params: CalendarListMessageParams,
): string {
  const {
    mode,
    nowLocal,
    weekOffset,
    dayOffset,
    monthOffset,
    yearOffset,
    spanDays = 2,
  } = params;

  switch (mode) {
    case 'past':
      return 'I don’t see any recent past events on your calendar.';

    case 'week':
      if (weekOffset === 0) return 'Your calendar is clear this week.';
      if (weekOffset === 1) return 'Your calendar is clear next week.';
      return 'I don’t see any events for that week.';

    case 'month':
      return `I don’t see any events for ${formatMonthWindowLabel(
        nowLocal,
        monthOffset,
      )}.`;

    case 'year':
      return `I don’t see any events for ${formatYearWindowLabel(
        nowLocal,
        yearOffset,
      )}.`;

    case 'day':
      if (dayOffset === 0) return 'Your calendar is clear today.';
      if (dayOffset === 1) return 'Your calendar is clear tomorrow.';

      return `I don’t see any events for ${describeDayWindow(
        nowLocal,
        dayOffset,
      )}.`;

    case 'next_days':
      return `I don’t see any events for ${describeNextDaysSpan(spanDays)}.`;

    case 'upcoming':
    default:
      return 'I don’t see any upcoming events on your calendar.';
  }
}

export function buildCalendarListUserMessage(
  params: CalendarListMessageParams,
): string {
  const { mode, maxEventsDefault, events } = params;

  if (mode === 'past') {
    const recent = events.slice(-maxEventsDefault).reverse();

    if (recent.length === 0) {
      return getEmptyCalendarMessage(params);
    }

    return (
      `Here are your last ${recent.length} events, most recent first:\n\n` +
      formatCalendarEventLines(recent)
    );
  }

  if (events.length === 0) {
    return getEmptyCalendarMessage(params);
  }

  const formattedEvents = formatCalendarEventLines(events);
  const label = getWindowLabel(params);

  if (label) {
    return `Here are your events for ${label}:\n\n${formattedEvents}`;
  }

  return `Here are your next ${events.length} events:\n\n${formattedEvents}`;
}