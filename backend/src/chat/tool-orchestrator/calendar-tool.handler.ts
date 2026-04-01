import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CalendarService } from '../../integrations/calendar/calendar.service';
import { LlmService } from '../../llm/llm.service';
import { debugCalendarLog } from '../../integrations/calendar/calendar-debug';
import { SessionPreferencesService } from '../session-preferences.service';
import { PendingRequestService } from '../pending-request.service';
import {
  extractCalendarEventArgs,
  extractCalendarMutationArgs,
} from './tool-orchestrator-llm-extractors';
import { buildCalendarListUserMessage } from './tool-orchestrator.calendar-list-reply';
import { filterEventsForMutation } from './tool-orchestrator.calendar-mutation-replies';
import {
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
  getSingleDayRangeLocal,
} from './tool-orchestrator.calendar-ranges';
import { resolvePendingListRange } from './tool-orchestrator.calendar-list-range';
import { mergeTimeOnlyUpdateOntoEventDay } from './tool-orchestrator.calendar-update-merge';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
import {
  getSlotListMode,
  getSlotNumber,
  getSlotTimeZone,
} from './tool-orchestrator.intent-slots';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarDeletePayload,
  PendingCalendarListPayload,
  PendingCalendarMutateTzPayload,
  PendingCalendarUpdatePayload,
} from './tool-orchestrator.types';
import type { IntentEnvelope } from '../intent/intent.types';

/**
 * Calendar integrations: list windows, create events, update/delete via search + pending picks.
 * Uses LLM extractors where natural language must become structured times or mutation targets.
 */
@Injectable()
export class CalendarToolHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly calendarService: CalendarService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly pendingRequestService: PendingRequestService,
  ) {}

  async handleCalendarListIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const tzCandidate = getSlotTimeZone(envelope);
    const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
    const timeZone = tzCandidate ?? storedTz;

    if (tzCandidate) {
      await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
        () => undefined,
      );
    }

    const mode = getSlotListMode(envelope);
    const weekOffset = getSlotNumber(envelope, 'weekOffset') ?? 0;
    const monthOffset = getSlotNumber(envelope, 'monthOffset') ?? 0;
    const yearOffset = getSlotNumber(envelope, 'yearOffset') ?? 0;
    const dayOffset = getSlotNumber(envelope, 'dayOffset') ?? 0;
    const maxEvents = getSlotNumber(envelope, 'maxEvents') ?? 10;
    const spanDays = getSlotNumber(envelope, 'spanDays') ?? 2;

    const pendingListRequest: PendingCalendarListPayload =
      mode === 'week'
        ? { mode, weekOffset }
        : mode === 'month'
          ? { mode, weekOffset: 0, monthOffset }
          : mode === 'year'
            ? { mode, weekOffset: 0, yearOffset }
            : mode === 'day'
              ? { mode, weekOffset: 0, dayOffset }
              : mode === 'next_days'
                ? {
                    mode,
                    weekOffset: 0,
                    spanDays: Math.max(1, Math.min(60, Math.floor(spanDays))),
                  }
                : mode === 'past'
                  ? { mode, weekOffset: 0, maxEvents }
                  : { mode: 'upcoming', weekOffset, maxEvents };

    if (!timeZone) {
      this.pendingRequestService.setPending<PendingCalendarListPayload>(
        sessionId,
        {
          actionType: 'calendar_list',
          originalMessage: message,
          payload: pendingListRequest,
          missingSlots: ['timeZone'],
          collectedSlots: {},
        },
      );
      return (
        'What timezone should I use for your events?\n\n' +
        'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
      );
    }

    try {
      const nowLocal = DateTime.now().setZone(timeZone);
      const { startLocal, endLocal } = resolvePendingListRange(
        nowLocal,
        timeZone,
        weekOffset,
        pendingListRequest,
      );

      debugCalendarLog('[tool-orchestrator.list] request', {
        mode: pendingListRequest.mode,
        timeZone,
        weekOffset,
        spanDays:
          pendingListRequest.mode === 'next_days'
            ? pendingListRequest.spanDays
            : undefined,
        maxEvents:
          pendingListRequest.mode === 'upcoming' ||
          pendingListRequest.mode === 'past'
            ? pendingListRequest.maxEvents
            : undefined,
        rangeLocal: { start: startLocal, end: endLocal },
      });

      const maxFetch =
        pendingListRequest.mode === 'upcoming' ||
        pendingListRequest.mode === 'past'
          ? pendingListRequest.maxEvents
          : undefined;

      const events = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: pendingListRequest.mode === 'past' ? undefined : maxFetch,
      });

      return buildCalendarListUserMessage({
        mode: pendingListRequest.mode,
        timeZone,
        nowLocal,
        weekOffset,
        dayOffset: pendingListRequest.dayOffset ?? 0,
        monthOffset: pendingListRequest.monthOffset ?? 0,
        yearOffset: pendingListRequest.yearOffset ?? 0,
        spanDays: pendingListRequest.spanDays ?? 2,
        maxEventsDefault: pendingListRequest.maxEvents ?? 10,
        events,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('list calendar events', e);
    }
  }

  async handleCalendarCreateIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const tzCandidate = getSlotTimeZone(envelope);
    const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
    const timeZone = tzCandidate ?? storedTz;

    if (tzCandidate) {
      await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
        () => undefined,
      );
    }

    if (!timeZone) {
      this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
        sessionId,
        {
          actionType: 'calendar_create',
          originalMessage: message,
          payload: { message },
          missingSlots: ['timeZone'],
          collectedSlots: {},
        },
      );
      return (
        'What timezone should I use for your events?\n\n' +
        'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
      );
    }

    try {
      this.pendingRequestService.clearPending(sessionId, 'calendar_create');
      const args = await extractCalendarEventArgs(
        this.llmService,
        message,
        timeZone,
      );
      if (!args) {
        return (
          `I can create that calendar event, but I need start and end time in your local time (${timeZone}). ` +
          `Example: March 26 12:00 to 13:00.`
        );
      }
      const event = await this.calendarService.createEvent({
        sessionId,
        title: args.title,
        start: args.start,
        end: args.end,
        description: args.description,
        reminderMinutesBefore: args.reminderMinutesBefore,
        timeZone,
      });

      return (
        `Event added to Google Calendar.\n\n` +
        `Title: ${event.title}\n` +
        `Time zone: ${timeZone}\n` +
        `Local start: ${args.start}\n` +
        `Local end: ${args.end}\n` +
        `Reminder (minutes before): ${
          event.reminderMinutesBefore !== undefined
            ? event.reminderMinutesBefore
            : 'none'
        }\n` +
        `Calendar: primary\n` +
        (event.url ? `Open: ${event.url}\n` : '') +
        `(event id: ${event.eventId})`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the calendar event', e);
    }
  }

  async handleCalendarMutationIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const tzCandidate = getSlotTimeZone(envelope);
    const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
    const timeZone = tzCandidate ?? storedTz;

    if (tzCandidate) {
      await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
        () => undefined,
      );
    }

    if (!timeZone) {
      this.pendingRequestService.setPending<PendingCalendarMutateTzPayload>(
        sessionId,
        {
          actionType: 'calendar_mutate_tz',
          originalMessage: message,
          payload: { message },
          missingSlots: ['timeZone'],
          collectedSlots: {},
        },
      );
      return (
        'What timezone should I use for your events?\n\n' +
        'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
      );
    }

    this.pendingRequestService.clearPending(sessionId, 'calendar_mutate_tz');
    return this.runCalendarMutation(sessionId, message, timeZone);
  }

  /**
   * After the user answers the timezone prompt for a blocked `calendar_create`.
   */
  async completeCreateAfterTimezone(
    sessionId: string,
    timeZone: string,
    originalMessage: string,
  ): Promise<string> {
    try {
      const args = await extractCalendarEventArgs(
        this.llmService,
        originalMessage,
        timeZone,
      );
      if (!args) {
        return `I saved your timezone as ${timeZone}, but I still need a valid start and end time to create the event.`;
      }

      const event = await this.calendarService.createEvent({
        sessionId,
        title: args.title,
        start: args.start,
        end: args.end,
        description: args.description,
        reminderMinutesBefore: args.reminderMinutesBefore,
        timeZone,
      });
      return (
        `Event added to Google Calendar.\n\n` +
        `Title: ${event.title}\n` +
        `Time zone: ${timeZone}\n` +
        `Local start: ${args.start}\n` +
        `Local end: ${args.end}\n` +
        `Reminder (minutes before): ${
          event.reminderMinutesBefore !== undefined
            ? event.reminderMinutesBefore
            : 'none'
        }\n` +
        `Calendar: primary\n` +
        (event.url ? `Open: ${event.url}\n` : '') +
        `(event id: ${event.eventId})`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the calendar event', e);
    }
  }

  /**
   * After the user answers the timezone prompt for a blocked `calendar_list`.
   */
  async completeListAfterTimezone(
    sessionId: string,
    timeZone: string,
    payload: PendingCalendarListPayload,
  ): Promise<string> {
    try {
      const nowLocal = DateTime.now().setZone(timeZone);
      const { startLocal, endLocal } = resolvePendingListRange(
        nowLocal,
        timeZone,
        payload.weekOffset,
        payload,
      );

      const maxFetch =
        payload.mode === 'upcoming' || payload.mode === 'past'
          ? payload.maxEvents
          : undefined;

      const events = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: payload.mode === 'past' ? undefined : maxFetch,
      });

      return buildCalendarListUserMessage({
        mode: payload.mode,
        timeZone,
        nowLocal,
        weekOffset: payload.weekOffset,
        dayOffset: payload.dayOffset ?? 0,
        monthOffset: payload.monthOffset ?? 0,
        yearOffset: payload.yearOffset ?? 0,
        spanDays: payload.spanDays ?? 2,
        maxEventsDefault: payload.maxEvents ?? 10,
        events,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('list calendar events', e);
    }
  }

  /** Used by `set_timezone` resume and by `handleCalendarMutationIntent`. */
  async runCalendarMutation(
    sessionId: string,
    userMessage: string,
    timeZone: string,
  ): Promise<string> {
    const extracted = await extractCalendarMutationArgs(
      this.llmService,
      userMessage,
      timeZone,
    );
    if (!extracted) {
      return (
        'I couldn’t tell which event or what to change. Try naming the event and the day ' +
        '(e.g. “move my dentist visit tomorrow to 4pm” or “cancel team sync Friday”).'
      );
    }

    if (extracted.operation === 'update') {
      if (!extracted.newTitle && !extracted.newStart && !extracted.newEnd) {
        return (
          'What should I change—title, time, or both? For example: “rename it to Budget review” or “move it to 4pm”.'
        );
      }
    }

    const nowLocal = DateTime.now().setZone(timeZone);
    let startLocal: string;
    let endLocal: string;

    if (extracted.searchWholeWeek) {
      ({ startLocal, endLocal } = getMonToSunRangeLocal(
        nowLocal,
        timeZone,
        0,
      ));
    } else if (extracted.dayOffset !== null) {
      ({ startLocal, endLocal } = getSingleDayRangeLocal(
        nowLocal,
        extracted.dayOffset,
      ));
    } else {
      const days = extracted.searchNextDays ?? 14;
      ({ startLocal, endLocal } = getNextDaysRangeLocal(nowLocal, days));
    }

    try {
      const events = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: 40,
      });

      const candidates = filterEventsForMutation(
        events,
        extracted.titleKeywords,
      );

      if (candidates.length === 0) {
        return (
          'I didn’t find a matching event in that window. Try listing your calendar or ' +
            'being more specific about the title or date.'
        );
      }

      if (candidates.length === 1) {
        const c = candidates[0];
        if (extracted.operation === 'delete') {
          this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
            sessionId,
            {
              actionType: 'calendar_delete',
              originalMessage: userMessage,
              payload: {
                phase: 'confirm',
                timeZone,
                eventId: c.eventId,
                calendarId: c.calendarId,
                title: c.title,
                startText: c.startText,
              },
              missingSlots: ['confirmation'],
              collectedSlots: {},
            },
          );
          return (
            `Delete “${c.title}” (${c.startText})?\n\n` +
              `Reply yes to remove it from Google Calendar, or cancel.`
          );
        }

        let start = extracted.newStart ?? undefined;
        let end = extracted.newEnd ?? undefined;
        if (!c.isAllDay && c.startLocalIso && (start || end)) {
          const merged = mergeTimeOnlyUpdateOntoEventDay({
            userMessage,
            timeZone,
            eventStartLocalIso: c.startLocalIso,
            eventEndLocalIso: c.endLocalIso,
            newStart: extracted.newStart,
            newEnd: extracted.newEnd,
          });
          if (merged) {
            start = merged.start;
            end = merged.end;
          }
        }
        const updated = await this.calendarService.updateEvent({
          sessionId,
          calendarId: c.calendarId,
          eventId: c.eventId,
          timeZone,
          title: extracted.newTitle ?? undefined,
          start,
          end,
        });
        return (
          `Updated in Google Calendar: “${updated.title}”.\n` +
          (updated.url ? `Open: ${updated.url}\n` : '') +
          `(event id: ${updated.eventId})`
        );
      }

      const sliced = candidates.slice(0, 12);
      const options = sliced.map((e, i) => ({
        index: i + 1,
        eventId: e.eventId,
        calendarId: e.calendarId,
        title: e.title,
        startText: e.startText,
        startLocalIso: e.startLocalIso,
        endLocalIso: e.endLocalIso,
      }));

      if (extracted.operation === 'delete') {
        this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
          sessionId,
          {
            actionType: 'calendar_delete',
            originalMessage: userMessage,
            payload: { phase: 'pick', timeZone, options },
            missingSlots: ['targetEvent'],
            collectedSlots: {},
          },
        );
      } else {
        this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
          sessionId,
          {
            actionType: 'calendar_update',
            originalMessage: userMessage,
            payload: {
              phase: 'pick',
              timeZone,
              newTitle: extracted.newTitle,
              newStart: extracted.newStart,
              newEnd: extracted.newEnd,
              options,
            },
            missingSlots: ['targetEvent'],
            collectedSlots: {},
          },
        );
      }

      const lines = options.map(
        (o) => `${o.index}. ${o.title} — ${o.startText}`,
      );
      return (
        `I found several events. Reply with a number (1–${options.length}):\n\n` +
        `${lines.join('\n')}\n\n` +
        `Or say cancel.`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('search or change calendar events', e);
    }
  }
}
