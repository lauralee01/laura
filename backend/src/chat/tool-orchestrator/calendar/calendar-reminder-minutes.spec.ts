import {
  parseReminderLeadMinutes,
  resolveReminderMinutesBefore,
} from './calendar-reminder-minutes';

describe('calendar reminder minutes', () => {
  it('parses common lead-time phrases', () => {
    expect(parseReminderLeadMinutes('one hour before')).toBe(60);
    expect(parseReminderLeadMinutes('Remind me 1 hour before the event')).toBe(
      60,
    );
    expect(parseReminderLeadMinutes('30 minutes before')).toBe(30);
    expect(parseReminderLeadMinutes('half an hour before')).toBe(30);
    expect(parseReminderLeadMinutes('at the start')).toBe(0);
    expect(parseReminderLeadMinutes('2 hours before')).toBe(120);
  });

  it('prefers extracted minutes, then Stage-1 slot, then message', () => {
    expect(
      resolveReminderMinutesBefore({
        extracted: 45,
        slotReminder: '1 hour before',
        userMessage: 'remind me 30 minutes before',
      }),
    ).toBe(45);

    expect(
      resolveReminderMinutesBefore({
        extracted: null,
        slotReminder: '1 hour before',
        userMessage: 'remind me before the event',
      }),
    ).toBe(60);

    expect(
      resolveReminderMinutesBefore({
        extracted: null,
        slotReminder: undefined,
        userMessage: 'Remind me one hour before the event',
      }),
    ).toBe(60);
  });
});
