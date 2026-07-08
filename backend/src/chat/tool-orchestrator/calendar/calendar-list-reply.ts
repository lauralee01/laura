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

export function buildCalendarListUserMessage(params: {
  mode: CalendarListMode;
  timeZone: string;
  nowLocal: DateTime;
  weekOffset: number;
  dayOffset: number;
  monthOffset: number;
  yearOffset: number;
  spanDays?: number;
  maxEventsDefault: number;
  events: ListCalendarEventSummary[];
}): string {
  const {
    mode,
    nowLocal,
    weekOffset,
    dayOffset,
    monthOffset,
    yearOffset,
    spanDays: spanDaysParam,
    maxEventsDefault,
    events,
  } = params;

  const spanDays = spanDaysParam ?? 2;

  if (mode === 'past') {
    const max = maxEventsDefault;
    const recent = events.slice(-max).reverse();

    if (recent.length === 0) {
      return 'I don’t see any recent past events on your calendar.';
    }

    return (
      `Here are your last ${recent.length} events, most recent first:\n\n` +
      formatCalendarEventLines(recent)
    );
  }

  if (events.length === 0) {
    if (mode === 'week') {
      return weekOffset === 1
        ? 'Your calendar is clear next week.'
        : weekOffset === 0
          ? 'Your calendar is clear this week.'
          : 'I don’t see any events for that week.';
    }

    if (mode === 'month') {
      const label = formatMonthWindowLabel(nowLocal, monthOffset);
      return `I don’t see any events for ${label}.`;
    }

    if (mode === 'year') {
      const label = formatYearWindowLabel(nowLocal, yearOffset);
      return `I don’t see any events for ${label}.`;
    }

    if (mode === 'day') {
      return dayOffset === 0
        ? 'Your calendar is clear today.'
        : dayOffset === 1
          ? 'Your calendar is clear tomorrow.'
          : `I don’t see any events for ${describeDayWindow(nowLocal, dayOffset)}.`;
    }

    if (mode === 'next_days') {
      return `I don’t see any events for ${describeNextDaysSpan(spanDays)}.`;
    }

    return 'I don’t see any upcoming events on your calendar.';
  }

  if (mode === 'week') {
    const range = formatMonToSunRange(nowLocal, weekOffset);
    return `Here are your events for ${range}:\n\n${formatCalendarEventLines(events)}`;
  }

  if (mode === 'month') {
    const label = formatMonthWindowLabel(nowLocal, monthOffset);
    return `Here are your events for ${label}:\n\n${formatCalendarEventLines(events)}`;
  }

  if (mode === 'year') {
    const label = formatYearWindowLabel(nowLocal, yearOffset);
    return `Here are your events for ${label}:\n\n${formatCalendarEventLines(events)}`;
  }

  if (mode === 'day') {
    const dayText = describeDayWindow(nowLocal, dayOffset);
    return `Here are your events for ${dayText}:\n\n${formatCalendarEventLines(events)}`;
  }

  if (mode === 'next_days') {
    const label = describeNextDaysSpan(spanDays);
    return `Here are your events for ${label}:\n\n${formatCalendarEventLines(events)}`;
  }

  return (
    `Here are your next ${maxEventsDefault} events:\n\n` +
    formatCalendarEventLines(events)
  );
}