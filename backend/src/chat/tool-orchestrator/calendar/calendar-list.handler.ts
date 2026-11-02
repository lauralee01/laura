import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { debugCalendarLog } from '../../../integrations/calendar/calendar-debug';
import { PendingRequestService } from '../../pending-request.service';
import {
  CALENDAR_TIMEZONE_PROMPT,
  CalendarTimezoneService,
} from './calendar-timezone.service';
import { buildCalendarListUserMessage } from './calendar-list-reply';
import { resolvePendingListRange } from './calendar-list-range';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { getSlotListMode, getSlotNumber } from '../tool-orchestrator.intent-slots';
import type { PendingCalendarListPayload } from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';

function buildListRequestFromEnvelope(
  envelope?: IntentEnvelope,
): PendingCalendarListPayload {
  const mode = getSlotListMode(envelope);
  const weekOffset = getSlotNumber(envelope, 'weekOffset') ?? 0;
  const monthOffset = getSlotNumber(envelope, 'monthOffset') ?? 0;
  const yearOffset = getSlotNumber(envelope, 'yearOffset') ?? 0;
  const dayOffset = getSlotNumber(envelope, 'dayOffset') ?? 0;
  const maxEvents = getSlotNumber(envelope, 'maxEvents') ?? 10;
  const spanDays = getSlotNumber(envelope, 'spanDays') ?? 2;

  if (mode === 'week') {
    return { mode, weekOffset };
  }
  if (mode === 'month') {
    return { mode, weekOffset: 0, monthOffset };
  }
  if (mode === 'year') {
    return { mode, weekOffset: 0, yearOffset };
  }
  if (mode === 'day') {
    return { mode, weekOffset: 0, dayOffset };
  }
  if (mode === 'next_days') {
    return {
      mode,
      weekOffset: 0,
      spanDays: Math.max(1, Math.min(60, Math.floor(spanDays))),
    };
  }
  if (mode === 'past') {
    return { mode, weekOffset: 0, maxEvents };
  }
  return { mode: 'upcoming', weekOffset, maxEvents };
}

@Injectable()
export class CalendarListHandler {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly timezoneService: CalendarTimezoneService,
    private readonly pendingRequestService: PendingRequestService,
  ) { }

  async handleCalendarListIntent(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    try {
      const listRequest = buildListRequestFromEnvelope(envelope);

      const timeZone = await this.timezoneService.resolveTimeZone(
        sessionId,
        envelope,
      );

      if (!timeZone) {
        this.pendingRequestService.setPending<PendingCalendarListPayload>(
          sessionId,
          {
            actionType: 'calendar_list',
            originalMessage: envelope?.intent ?? 'calendar_list',
            payload: listRequest,
            missingSlots: ['timeZone'],
            collectedSlots: {},
          },
        );
        return CALENDAR_TIMEZONE_PROMPT;
      }

      const weekOffset = listRequest.weekOffset;
      const nowLocal = DateTime.now().setZone(timeZone);

      const { startLocal, endLocal } = resolvePendingListRange(
        nowLocal,
        listRequest,
      );

      debugCalendarLog('[tool-orchestrator.list] request', {
        mode: listRequest.mode,
        timeZone,
        weekOffset,
        spanDays:
          listRequest.mode === 'next_days'
            ? listRequest.spanDays
            : undefined,
        maxEvents:
          listRequest.mode === 'upcoming' ||
            listRequest.mode === 'past'
            ? listRequest.maxEvents
            : undefined,
        rangeLocal: {
          start: startLocal,
          end: endLocal,
        },
      });

      const maxFetch =
        listRequest.mode === 'upcoming' ||
          listRequest.mode === 'past'
          ? listRequest.maxEvents
          : undefined;

      const events = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: listRequest.mode === 'past' ? undefined : maxFetch,
      });

      return buildCalendarListUserMessage({
        mode: listRequest.mode,
        nowLocal,
        weekOffset,
        dayOffset: listRequest.dayOffset ?? 0,
        monthOffset: listRequest.monthOffset ?? 0,
        yearOffset: listRequest.yearOffset ?? 0,
        spanDays: listRequest.spanDays ?? 2,
        maxEventsDefault: listRequest.maxEvents ?? 10,
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
