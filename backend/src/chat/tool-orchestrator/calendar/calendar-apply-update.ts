import type { CalendarService } from '../../../integrations/calendar/calendar.service';
import { mergeTimeOnlyUpdateOntoEventDay } from './calendar-update-merge';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';

export type ApplyCalendarUpdateInput = {
  sessionId: string;
  calendarService: CalendarService;
  calendarId: string;
  eventId: string;
  timeZone: string;
  title?: string | null;
  newStart?: string | null;
  newEnd?: string | null;
  eventStartLocalIso?: string;
  eventEndLocalIso?: string;
  /**
   * Message used for time-only merge heuristics (usually the original
   * update request, not a bare pick like "1").
   */
  mergeUserMessage: string;
};

export function formatCalendarUpdateSuccess(input: {
  title: string;
  url?: string;
}): string {
  return (
    `Done — I updated **${input.title}** in your Google Calendar.` +
    (input.url ? `\n\nOpen in Calendar: ${input.url}` : '')
  );
}

export type ApplyCalendarUpdateResult =
  | { ok: true; text: string }
  | { ok: false; text: string };

/**
 * Shared update apply used by mutation handler and pending pick/details flows.
 */
export async function applyCalendarUpdate(
  input: ApplyCalendarUpdateInput,
): Promise<ApplyCalendarUpdateResult> {
  let resolvedUpdatedStart = input.newStart ?? undefined;
  let resolvedUpdatedEnd = input.newEnd ?? undefined;

  if (
    input.eventStartLocalIso &&
    (resolvedUpdatedStart || resolvedUpdatedEnd)
  ) {
    const mergedTimeOnlyUpdate = mergeTimeOnlyUpdateOntoEventDay({
      userMessage: input.mergeUserMessage,
      timeZone: input.timeZone,
      eventStartLocalIso: input.eventStartLocalIso,
      eventEndLocalIso: input.eventEndLocalIso,
      newStart: input.newStart ?? null,
      newEnd: input.newEnd ?? null,
    });

    if (mergedTimeOnlyUpdate) {
      resolvedUpdatedStart = mergedTimeOnlyUpdate.start;
      resolvedUpdatedEnd = mergedTimeOnlyUpdate.end;
    }
  }

  try {
    const updated = await input.calendarService.updateEvent({
      sessionId: input.sessionId,
      calendarId: input.calendarId,
      eventId: input.eventId,
      timeZone: input.timeZone,
      title: input.title ?? undefined,
      start: resolvedUpdatedStart,
      end: resolvedUpdatedEnd,
    });

    return {
      ok: true,
      text: formatCalendarUpdateSuccess({
        title: updated.title,
        url: updated.url,
      }),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      text: formatToolFailureMessage('update the calendar event', error),
    };
  }
}
