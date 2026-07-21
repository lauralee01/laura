import { mergeTimeOnlyUpdateOntoEventDay } from './calendar-update-merge';
import { filterEventsForMutation } from './calendar-mutation-replies';
import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';

describe('Calendar Update & Filtering Logic', () => {
  describe('mergeTimeOnlyUpdateOntoEventDay', () => {
    const timeZone = 'America/Chicago';
    const fridayStartIso = '2026-07-24T14:00:00'; // Friday at 2 PM
    const fridayEndIso = '2026-07-24T15:00:00';   // Friday at 3 PM

    it('should merge clock time onto event day when user specifies time only', () => {
      const merged = mergeTimeOnlyUpdateOntoEventDay({
        userMessage: 'move it to 4pm',
        timeZone,
        eventStartLocalIso: fridayStartIso,
        eventEndLocalIso: fridayEndIso,
        newStart: '2026-07-21T16:00:00', // extractor defaulted to today at 4pm
        newEnd: '2026-07-21T17:00:00',
      });

      expect(merged).not.toBeNull();
      expect(merged?.start).toBe('2026-07-24T16:00:00'); // Preserves Friday date, updates to 4pm
      expect(merged?.end).toBe('2026-07-24T17:00:00');
    });

    it('should skip merge when user explicitly mentions a calendar date', () => {
      const merged = mergeTimeOnlyUpdateOntoEventDay({
        userMessage: 'move it to tomorrow at 4pm',
        timeZone,
        eventStartLocalIso: fridayStartIso,
        eventEndLocalIso: fridayEndIso,
        newStart: '2026-07-22T16:00:00',
        newEnd: '2026-07-22T17:00:00',
      });

      expect(merged).toBeNull();
    });
  });

  describe('filterEventsForMutation', () => {
    const sampleEvents: ListCalendarEventSummary[] = [
      {
        calendarId: 'primary',
        eventId: '1',
        title: 'Dentist Appointment',
        isAllDay: false,
        startText: '3:00 PM',
        startLocalIso: '2026-07-24T15:00:00',
      },
      {
        calendarId: 'primary',
        eventId: '2',
        title: 'Team Sync',
        isAllDay: false,
        startText: '10:00 AM',
        startLocalIso: '2026-07-24T10:00:00',
      },
      {
        calendarId: 'primary',
        eventId: '3',
        title: '1:1 with Bob',
        isAllDay: false,
        startText: '2:00 PM',
        startLocalIso: '2026-07-24T14:00:00',
      },
    ];

    it('should filter event by title keyword', () => {
      const result = filterEventsForMutation(sampleEvents, 'dentist');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Dentist Appointment');
    });

    it('should filter event by time hint when title is generic or absent', () => {
      const result = filterEventsForMutation(sampleEvents, '3pm meeting');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Dentist Appointment');
    });

    it('should match title and time together', () => {
      const result = filterEventsForMutation(sampleEvents, 'bob at 2pm');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('1:1 with Bob');
    });
  });
});
