import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../integrations/calendar/calendar.service';
import { EmailService } from '../../integrations/email/email.service';
import { LlmService } from '../../llm/llm.service';
import { DateTime } from 'luxon';
import { debugCalendarLog } from '../../integrations/calendar/calendar-debug';
import { SessionPreferencesService } from '../session-preferences.service';
import { PendingRequestService } from '../pending-request.service';
import {
  extractCalendarEventArgs,
  extractDraftEmailArgs,
} from './tool-orchestrator-llm-extractors';
import { buildCalendarListUserMessage } from './tool-orchestrator.calendar-list-reply';
import {
  getCalendarMonthRangeLocal,
  getCalendarYearRangeLocal,
  getMonToSunRangeLocal,
  getPastRangeLocal,
  getSingleDayRangeLocal,
  getUpcomingRangeLocal,
} from './tool-orchestrator.calendar-ranges';
import {
  extractDayOffset,
  extractListedEventCount,
  extractMonthOffset,
  extractWeekOffset,
  extractYearOffset,
  isCalendarCreateIntent,
  isCalendarListIntent,
  isDayListing,
  isEmailDraftIntent,
  isMonthListing,
  isPastCalendarListIntent,
  isWeekListing,
  isYearListing,
} from './tool-orchestrator.calendar-intents';
import {
  extractTimeZoneFromMessage,
  isTimeZoneSettingMessage,
} from './tool-orchestrator.timezone';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarListPayload,
} from './tool-orchestrator.types';
import { formatToolFailureMessage } from './tool-orchestrator.utils';

/**
 * Routes chat messages to tool actions (email draft, calendar list/create)
 * and handles timezone follow-ups via PendingRequestService.
 */
@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly pendingRequestService: PendingRequestService,
  ) {}

  async tryHandle(sessionId: string, message: string): Promise<string | null> {
    if (isEmailDraftIntent(message)) {
      const args = await extractDraftEmailArgs(this.llmService, message);
      if (!args) {
        return 'I can draft that email, but I need at least one recipient email address (e.g. jordan@example.com).';
      }

      try {
        const draft = await this.emailService.draftEmail({
          sessionId,
          recipients: args.recipients,
          subject: args.subject,
          tone: args.tone,
          context: args.context,
        });

        return (
          `Draft saved in Gmail.\n\n` +
          `Recipients: ${draft.recipients.join(', ')}\n` +
          `Subject: ${draft.subject}\n\n` +
          `${draft.body}`
        );
      } catch (e: unknown) {
        return formatToolFailureMessage('create the Gmail draft', e);
      }
    }

    if (isCalendarListIntent(message)) {
      const tzCandidate = extractTimeZoneFromMessage(message);
      const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
      const timeZone = tzCandidate ?? storedTz;

      if (tzCandidate) {
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
          () => undefined,
        );
      }

      const weekOffset = extractWeekOffset(message);
      const weekListing = isWeekListing(message);
      const monthListing = isMonthListing(message);
      const monthOffset = extractMonthOffset(message);
      const yearListing = isYearListing(message);
      const yearOffset = extractYearOffset(message);
      const dayListing = isDayListing(message);
      const dayOffset = extractDayOffset(message);
      const listedCount = extractListedEventCount(message);
      const pastIntent = isPastCalendarListIntent(message);

      const pendingListRequest: PendingCalendarListPayload = weekListing
        ? { mode: 'week', weekOffset }
        : monthListing
          ? { mode: 'month', weekOffset: 0, monthOffset }
          : yearListing
            ? { mode: 'year', weekOffset: 0, yearOffset }
            : dayListing
              ? { mode: 'day', weekOffset: 0, dayOffset }
              : pastIntent
                ? { mode: 'past', weekOffset: 0, maxEvents: listedCount ?? 10 }
                : { mode: 'upcoming', weekOffset, maxEvents: listedCount ?? 10 };

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
        const { startLocal, endLocal } = this.resolveListRange(
          nowLocal,
          timeZone,
          weekOffset,
          pendingListRequest,
        );

        debugCalendarLog('[tool-orchestrator.list] request', {
          mode: pendingListRequest.mode,
          timeZone,
          weekOffset,
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
          maxEvents:
            pendingListRequest.mode === 'past' ? undefined : maxFetch,
        });

        return buildCalendarListUserMessage({
          mode: pendingListRequest.mode,
          timeZone,
          nowLocal,
          weekOffset,
          dayOffset: pendingListRequest.dayOffset ?? 0,
          monthOffset: pendingListRequest.monthOffset ?? 0,
          yearOffset: pendingListRequest.yearOffset ?? 0,
          maxEventsDefault: pendingListRequest.maxEvents ?? 10,
          events,
        });
      } catch (e: unknown) {
        return formatToolFailureMessage('list calendar events', e);
      }
    }

    if (isCalendarCreateIntent(message)) {
      const tzCandidate = extractTimeZoneFromMessage(message);
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

    const tzCandidate = extractTimeZoneFromMessage(message);
    if (tzCandidate && isTimeZoneSettingMessage(message, tzCandidate)) {
      try {
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate);
      } catch (e: unknown) {
        return formatToolFailureMessage('set timezone', e);
      }

      const pending = this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );
      if (pending) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_create');
        try {
          const args = await extractCalendarEventArgs(
            this.llmService,
            pending.payload.message,
            tzCandidate,
          );
          if (!args) {
            return `I saved your timezone as ${tzCandidate}, but I still need a valid start and end time to create the event.`;
          }

          const event = await this.calendarService.createEvent({
            sessionId,
            title: args.title,
            start: args.start,
            end: args.end,
            description: args.description,
            reminderMinutesBefore: args.reminderMinutesBefore,
            timeZone: tzCandidate,
          });
          return (
            `Event added to Google Calendar.\n\n` +
            `Title: ${event.title}\n` +
            `Time zone: ${tzCandidate}\n` +
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

      const pendingList = this.pendingRequestService.getPending<PendingCalendarListPayload>(
        sessionId,
        'calendar_list',
      );
      if (pendingList) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_list');
        try {
          const nowLocal = DateTime.now().setZone(tzCandidate);
          const { startLocal, endLocal } = this.resolveListRange(
            nowLocal,
            tzCandidate,
            pendingList.payload.weekOffset,
            pendingList.payload,
          );

          const maxFetch =
            pendingList.payload.mode === 'upcoming' ||
            pendingList.payload.mode === 'past'
              ? pendingList.payload.maxEvents
              : undefined;

          const events = await this.calendarService.listEvents({
            sessionId,
            timeZone: tzCandidate,
            start: startLocal,
            end: endLocal,
            maxEvents:
              pendingList.payload.mode === 'past' ? undefined : maxFetch,
          });

          return buildCalendarListUserMessage({
            mode: pendingList.payload.mode,
            timeZone: tzCandidate,
            nowLocal,
            weekOffset: pendingList.payload.weekOffset,
            dayOffset: pendingList.payload.dayOffset ?? 0,
            monthOffset: pendingList.payload.monthOffset ?? 0,
            yearOffset: pendingList.payload.yearOffset ?? 0,
            maxEventsDefault: pendingList.payload.maxEvents ?? 10,
            events,
          });
        } catch (e: unknown) {
          return formatToolFailureMessage('list calendar events', e);
        }
      }

      return `Got it — I’ll schedule events in ${tzCandidate}.`;
    }

    return null;
  }

  private resolveListRange(
    nowLocal: DateTime,
    timeZone: string,
    weekOffset: number,
    pendingListRequest: PendingCalendarListPayload,
  ): { startLocal: string; endLocal: string } {
    if (pendingListRequest.mode === 'week') {
      return getMonToSunRangeLocal(nowLocal, timeZone, weekOffset);
    }
    if (pendingListRequest.mode === 'month') {
      return getCalendarMonthRangeLocal(
        nowLocal,
        pendingListRequest.monthOffset ?? 0,
      );
    }
    if (pendingListRequest.mode === 'year') {
      return getCalendarYearRangeLocal(
        nowLocal,
        pendingListRequest.yearOffset ?? 0,
      );
    }
    if (pendingListRequest.mode === 'day') {
      return getSingleDayRangeLocal(
        nowLocal,
        pendingListRequest.dayOffset ?? 0,
      );
    }
    if (pendingListRequest.mode === 'past') {
      return getPastRangeLocal(nowLocal);
    }
    return getUpcomingRangeLocal(nowLocal);
  }
}
