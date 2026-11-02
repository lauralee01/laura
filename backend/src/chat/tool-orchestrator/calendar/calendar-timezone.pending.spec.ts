import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import { CalendarListHandler } from './calendar-list.handler';
import { CalendarCreateHandler } from './calendar-create.handler';
import { CalendarMutationHandler } from './calendar-mutation.handler';
import {
  CALENDAR_TIMEZONE_PROMPT,
  CalendarTimezoneService,
} from './calendar-timezone.service';
import { LlmService } from '../../../llm/llm.service';

describe('calendar missing-timezone pending', () => {
  let pending: PendingRequestService;
  let timezoneService: CalendarTimezoneService;
  let listHandler: CalendarListHandler;
  let createHandler: CalendarCreateHandler;
  let mutationHandler: CalendarMutationHandler;
  let getTimeZone: jest.Mock;

  beforeEach(async () => {
    getTimeZone = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingRequestService,
        CalendarTimezoneService,
        CalendarListHandler,
        CalendarCreateHandler,
        CalendarMutationHandler,
        {
          provide: SessionPreferencesService,
          useValue: {
            getTimeZone,
            setTimeZone: jest.fn(),
          },
        },
        {
          provide: CalendarService,
          useValue: {
            listEvents: jest.fn(),
            createEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
          },
        },
        {
          provide: LlmService,
          useValue: { generate: jest.fn() },
        },
      ],
    }).compile();

    pending = module.get(PendingRequestService);
    timezoneService = module.get(CalendarTimezoneService);
    listHandler = module.get(CalendarListHandler);
    createHandler = module.get(CalendarCreateHandler);
    mutationHandler = module.get(CalendarMutationHandler);
  });

  it('resolveTimeZone returns null when session has no timezone', async () => {
    await expect(
      timezoneService.resolveTimeZone('sess-1'),
    ).resolves.toBeNull();
  });

  it('list sets calendar_list pending and asks for timezone', async () => {
    const reply = await listHandler.handleCalendarListIntent('sess-1', {
      version: 1,
      intent: 'calendar_list',
      confidence: 0.9,
      confidenceKnown: true,
      missingSlots: [],
      slots: { mode: 'upcoming', maxEvents: 5 },
    });

    expect(reply).toBe(CALENDAR_TIMEZONE_PROMPT);
    const stored = pending.getPending('sess-1', 'calendar_list');
    expect(stored).not.toBeNull();
    expect(stored?.missingSlots).toContain('timeZone');
    expect(stored?.payload).toMatchObject({
      mode: 'upcoming',
      maxEvents: 5,
    });
  });

  it('create sets calendar_create pending and asks for timezone', async () => {
    const reply = await createHandler.handleCalendarCreateIntent(
      'sess-1',
      'Schedule lunch with Sam tomorrow at noon',
    );

    expect(reply).toBe(CALENDAR_TIMEZONE_PROMPT);
    const stored = pending.getPending('sess-1', 'calendar_create');
    expect(stored).not.toBeNull();
    expect(stored?.missingSlots).toEqual(['timeZone']);
    expect(stored?.payload.message).toContain('lunch with Sam');
  });

  it('mutation sets calendar_mutate_tz pending and asks for timezone', async () => {
    const reply = await mutationHandler.handleCalendarMutationIntent(
      'sess-1',
      'Cancel my dentist appointment tomorrow',
      {
        version: 1,
        intent: 'calendar_delete',
        confidence: 0.95,
        confidenceKnown: true,
        missingSlots: [],
        slots: {},
      },
    );

    expect(reply).toBe(CALENDAR_TIMEZONE_PROMPT);
    const stored = pending.getPending('sess-1', 'calendar_mutate_tz');
    expect(stored).not.toBeNull();
    expect(stored?.payload.message).toContain('dentist');
  });
});
