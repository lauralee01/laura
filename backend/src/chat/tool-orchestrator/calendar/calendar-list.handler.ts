import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { debugCalendarLog } from '../../../integrations/calendar/calendar-debug';
import { PendingRequestService } from '../../pending-request.service';
import { CalendarTimezoneService } from './calendar-timezone.service';
import { buildCalendarListUserMessage } from './calendar-list-reply';
import { resolvePendingListRange } from './calendar-list-range';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { getSlotListMode, getSlotNumber } from '../tool-orchestrator.intent-slots';
import type { PendingCalendarListPayload } from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';

@Injectable()
export class CalendarListHandler {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly timezoneService: CalendarTimezoneService,
  ) {}

  async handleCalendarListIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const timeZone = await this.timezoneService.resolveTimeZone(sessionId, envelope);

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
      return this.timezoneService.formatTimezoneQuestion();
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
}
