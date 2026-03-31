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
  extractCalendarMutationArgs,
  extractDraftEmailArgs,
} from './tool-orchestrator-llm-extractors';
import { buildCalendarListUserMessage } from './tool-orchestrator.calendar-list-reply';
import {
  filterEventsForMutation,
  isConfirmCalendarMutation,
  parseEventChoiceIndex,
} from './tool-orchestrator.calendar-mutation-replies';
import {
  getCalendarMonthRangeLocal,
  getCalendarYearRangeLocal,
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
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
  isDayListing,
  isMonthListing,
  isPastCalendarListIntent,
  isWeekListing,
  isYearListing,
} from './tool-orchestrator.calendar-intents';
import {
  extractTimeZoneFromMessage,
  isTimeZoneSettingMessage,
} from './tool-orchestrator.timezone';
import {
  isCancelPendingEmailSend,
  isConfirmSendEmail,
  isEmailDraftRevisionIntent,
  shouldClearEmailSendForNewToolIntent,
} from './tool-orchestrator.email-send-intents';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarDeletePayload,
  PendingCalendarListPayload,
  PendingCalendarMutateTzPayload,
  PendingCalendarUpdatePayload,
  PendingEmailSendPayload,
} from './tool-orchestrator.types';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
import type { IntentEnvelope } from '../intent/intent.types';
import type { PendingRequest } from '../pending-request.service';

/**
 * Routes chat messages to tool actions (email draft, calendar list/create/update/delete)
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

  /** List path shared by regex routing and LLM `calendar_list` routing. */
  async handleCalendarListIntent(
    sessionId: string,
    message: string,
  ): Promise<string> {
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
        maxEventsDefault: pendingListRequest.maxEvents ?? 10,
        events,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('list calendar events', e);
    }
  }

  /** Create path shared by regex routing and LLM `calendar_create` routing. */
  async handleCalendarCreateIntent(
    sessionId: string,
    message: string,
  ): Promise<string> {
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

  /** Update/delete: timezone + mutation extractor + list/search (same as legacy). */
  async handleCalendarMutationIntent(
    sessionId: string,
    message: string,
  ): Promise<string> {
    const tzCandidate = extractTimeZoneFromMessage(message);
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

  /** New Gmail draft path (regex or LLM `email_draft`). Does not check `isEmailDraftIntent`. */
  async handleEmailDraftIntent(
    sessionId: string,
    message: string,
  ): Promise<string> {
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

      this.pendingRequestService.setPending<PendingEmailSendPayload>(
        sessionId,
        {
          actionType: 'email_send',
          originalMessage: message,
          payload: {
            draftId: draft.draftId,
            recipients: draft.recipients,
            subject: draft.subject,
            body: draft.body,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
        },
      );

      return (
        `Draft saved in Gmail.\n\n` +
        `Recipients: ${draft.recipients.join(', ')}\n` +
        `Subject: ${draft.subject}\n\n` +
        `${draft.body}\n\n` +
        `---\n` +
        `Send it? Reply send or yes to send from your Gmail now, or say how you’d like it revised, or cancel to skip sending (the draft stays in Gmail).`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the Gmail draft', e);
    }
  }

  /**
   * When a Gmail draft is waiting for send/revise/cancel. Returns null if no pending email_send.
   * When the user starts a new tool intent, clears pending and returns null so the caller continues.
   */
  async handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
  ): Promise<string | null> {
    const pendingSend =
      this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );
    if (!pendingSend) return null;

    if (isCancelPendingEmailSend(message)) {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
      return (
        'Okay — I won’t send that draft from here. ' +
        'It’s still in your Gmail drafts if you want to send or edit it there.'
      );
    }
    if (isConfirmSendEmail(message)) {
      return this.sendPendingEmailDraftNow(sessionId, pendingSend);
    }
    if (shouldClearEmailSendForNewToolIntent(message)) {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
      return null;
    }
    if (isEmailDraftRevisionIntent(message)) {
      return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
    }
    return (
      'I still have a draft ready to send:\n' +
      `To: ${pendingSend.payload.recipients.join(', ')}\n` +
      `Subject: ${pendingSend.payload.subject}\n\n` +
      `${pendingSend.payload.body}\n\n` +
      'Reply send or yes to send it now, or describe how you’d like the draft changed, or cancel to dismiss this prompt (the draft stays in Gmail).'
    );
  }

  /**
   * Stage-1 email routing: intent must align with regex guards before send/revise/cancel.
   * Returns null to fall back to regex pending-email handling or tryHandle.
   */
  async tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<string | null> {
    const pendingSend =
      this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (pendingSend) {
      if (
        envelope.intent === 'pending_cancel' &&
        isCancelPendingEmailSend(message)
      ) {
        this.pendingRequestService.clearPending(sessionId, 'email_send');
        return (
          'Okay — I won’t send that draft from here. ' +
          'It’s still in your Gmail drafts if you want to send or edit it there.'
        );
      }
      if (envelope.intent === 'email_send_confirm') {
        if (!isConfirmSendEmail(message)) return null;
        return this.sendPendingEmailDraftNow(sessionId, pendingSend);
      }
      if (envelope.intent === 'email_draft_revise') {
        if (!isEmailDraftRevisionIntent(message)) return null;
        return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
      }
      if (envelope.intent === 'email_draft') {
        if (!shouldClearEmailSendForNewToolIntent(message)) return null;
        this.pendingRequestService.clearPending(sessionId, 'email_send');
        return this.handleEmailDraftIntent(sessionId, message);
      }
      return null;
    }

    if (envelope.intent === 'email_draft') {
      return this.handleEmailDraftIntent(sessionId, message);
    }
    return null;
  }

  private async sendPendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
  ): Promise<string> {
    try {
      const sent = await this.emailService.sendDraft(
        sessionId,
        pendingSend.payload.draftId,
      );
      this.pendingRequestService.clearPending(sessionId, 'email_send');
      return (
        `Email sent from your Gmail.\n\n` +
        `To: ${pendingSend.payload.recipients.join(', ')}\n` +
        `Subject: ${pendingSend.payload.subject}\n` +
        (sent.messageId ? `Message id: ${sent.messageId}\n` : '')
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('send the email', e);
    }
  }

  private async revisePendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
    message: string,
  ): Promise<string> {
    try {
      const revised = await this.emailService.reviseDraftEmail({
        sessionId,
        draftId: pendingSend.payload.draftId,
        recipients: pendingSend.payload.recipients,
        currentSubject: pendingSend.payload.subject,
        currentBody: pendingSend.payload.body,
        revisionInstruction: message,
      });

      this.pendingRequestService.setPending<PendingEmailSendPayload>(
        sessionId,
        {
          actionType: 'email_send',
          originalMessage: pendingSend.originalMessage,
          payload: {
            draftId: revised.draftId,
            recipients: revised.recipients,
            subject: revised.subject,
            body: revised.body,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
        },
      );

      return (
        `Updated your Gmail draft.\n\n` +
        `Recipients: ${revised.recipients.join(', ')}\n` +
        `Subject: ${revised.subject}\n\n` +
        `${revised.body}\n\n` +
        `---\n` +
        `Send it? Reply send or yes to send from your Gmail now, or ask for another change, or cancel to skip sending (the draft stays in Gmail).`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('update the Gmail draft', e);
    }
  }

  async tryHandle(sessionId: string, message: string): Promise<string | null> {
    const pendingEmail = await this.handlePendingEmailSendTurn(
      sessionId,
      message,
    );
    if (pendingEmail !== null) return pendingEmail;

    const pendingDelete =
      this.pendingRequestService.getPending<PendingCalendarDeletePayload>(
        sessionId,
        'calendar_delete',
      );
    if (pendingDelete) {
      if (isCancelPendingEmailSend(message)) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_delete');
        return (
          'Okay — I won’t delete anything. Ask again when you want to remove an event.'
        );
      }
      const p = pendingDelete.payload;
      if (p.phase === 'pick') {
        const idx = parseEventChoiceIndex(message, p.options.length);
        if (idx === null) {
          return (
            `Reply with a number 1–${p.options.length} for the event to delete, or say cancel.`
          );
        }
        const opt = p.options[idx - 1];
        this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
          sessionId,
          {
            actionType: 'calendar_delete',
            originalMessage: pendingDelete.originalMessage,
            payload: {
              phase: 'confirm',
              timeZone: p.timeZone,
              eventId: opt.eventId,
              calendarId: opt.calendarId,
              title: opt.title,
              startText: opt.startText,
            },
            missingSlots: ['confirmation'],
            collectedSlots: {},
          },
        );
        return (
          `Delete “${opt.title}” (${opt.startText})?\n\n` +
            `Reply yes to remove it from Google Calendar, or cancel.`
        );
      }
      if (isConfirmCalendarMutation(message)) {
        try {
          await this.calendarService.deleteEvent(
            sessionId,
            p.calendarId,
            p.eventId,
          );
          this.pendingRequestService.clearPending(sessionId, 'calendar_delete');
          return (
            `Deleted from Google Calendar: “${p.title}” (${p.startText}).`
          );
        } catch (e: unknown) {
          return formatToolFailureMessage('delete the calendar event', e);
        }
      }
      return (
        `Still waiting: delete “${p.title}”?\n` +
        `Reply yes to confirm, or cancel.`
      );
    }

    const pendingUpdate =
      this.pendingRequestService.getPending<PendingCalendarUpdatePayload>(
        sessionId,
        'calendar_update',
      );
    if (pendingUpdate) {
      if (isCancelPendingEmailSend(message)) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_update');
        return (
          'Okay — I won’t change that event. Ask again when you want to reschedule or rename something.'
        );
      }
      const pu = pendingUpdate.payload;
      const idx = parseEventChoiceIndex(message, pu.options.length);
      if (idx === null) {
        return (
          `Reply with a number 1–${pu.options.length} for the event to update, or say cancel.`
        );
      }
      const opt = pu.options[idx - 1];
      this.pendingRequestService.clearPending(sessionId, 'calendar_update');
      try {
        const updated = await this.calendarService.updateEvent({
          sessionId,
          calendarId: opt.calendarId,
          eventId: opt.eventId,
          timeZone: pu.timeZone,
          title: pu.newTitle ?? undefined,
          start: pu.newStart ?? undefined,
          end: pu.newEnd ?? undefined,
        });
        return (
          `Updated in Google Calendar: “${updated.title}”.\n` +
          (updated.url ? `Open: ${updated.url}\n` : '') +
          `(event id: ${updated.eventId})`
        );
      } catch (e: unknown) {
        return formatToolFailureMessage('update the calendar event', e);
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

      const pendingMutTz =
        this.pendingRequestService.getPending<PendingCalendarMutateTzPayload>(
          sessionId,
          'calendar_mutate_tz',
        );
      if (pendingMutTz) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_mutate_tz');
        return await this.runCalendarMutation(
          sessionId,
          pendingMutTz.payload.message,
          tzCandidate,
        );
      }

      return `Got it — I’ll schedule events in ${tzCandidate}.`;
    }

    return null;
  }

  private async runCalendarMutation(
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

        const updated = await this.calendarService.updateEvent({
          sessionId,
          calendarId: c.calendarId,
          eventId: c.eventId,
          timeZone,
          title: extracted.newTitle ?? undefined,
          start: extracted.newStart ?? undefined,
          end: extracted.newEnd ?? undefined,
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
