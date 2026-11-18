import { Test, TestingModule } from '@nestjs/testing';
import { CalendarListHandler } from '../calendar/calendar-list.handler';
import { WebSearchToolHandler } from '../web-search/web-search-tool.handler';
import { EveningWindDownHandler } from './evening-wind-down.handler';

describe('EveningWindDownHandler', () => {
  let handler: EveningWindDownHandler;
  let handleCalendarListIntent: jest.Mock;
  let handleWebSearchIntent: jest.Mock;

  beforeEach(async () => {
    handleCalendarListIntent = jest.fn();
    handleWebSearchIntent = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EveningWindDownHandler,
        {
          provide: CalendarListHandler,
          useValue: { handleCalendarListIntent },
        },
        {
          provide: WebSearchToolHandler,
          useValue: { handleWebSearchIntent },
        },
      ],
    }).compile();

    handler = module.get(EveningWindDownHandler);
  });

  it('works without Google and invites reflection', async () => {
    const text = await handler.handleEveningWindDown(
      'sess-1',
      'America/Chicago',
      'Austin',
      false,
    );

    expect(handleCalendarListIntent).not.toHaveBeenCalled();
    expect(text).toMatch(/evening wind-down/i);
    expect(text).toMatch(/Connect Google/i);
    expect(text).toMatch(/Reflect with me/i);
    expect(text).toMatch(/one thing for tomorrow/i);
    expect(handleWebSearchIntent).toHaveBeenCalled();
  });

  it('includes tomorrow calendar when Google is connected', async () => {
    handleCalendarListIntent.mockResolvedValue(
      'Tomorrow: Dentist at 10:00 AM',
    );
    handleWebSearchIntent.mockResolvedValue({
      kind: 'reply',
      text: 'Clear tonight.',
    });

    const text = await handler.handleEveningWindDown(
      'sess-1',
      'America/Chicago',
      'Austin',
      true,
    );

    expect(handleCalendarListIntent).toHaveBeenCalled();
    expect(text).toMatch(/Dentist/i);
    expect(text).toMatch(/Weather tonight/i);
  });
});
