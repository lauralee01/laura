import { Injectable } from '@nestjs/common';
import {
  formatCurrentDateTime,
  resolveSessionTimeZone,
} from '../../datetime-context';
import { CALENDAR_TIMEZONE_PROMPT } from '../calendar/calendar-timezone.service';
import { CalendarListHandler } from '../calendar/calendar-list.handler';
import { WebSearchToolHandler } from '../web-search/web-search-tool.handler';
import {
  loadCalendarDaySection,
  loadWeatherSection,
} from './briefing-shared';

@Injectable()
export class EveningWindDownHandler {
  constructor(
    private readonly calendarListHandler: CalendarListHandler,
    private readonly webSearchTools: WebSearchToolHandler,
  ) {}

  async handleEveningWindDown(
    sessionId: string,
    sessionTz: string | null,
    storedLocation: string | null,
    googleConnected = false,
  ): Promise<string> {
    const timeZone = resolveSessionTimeZone(sessionTz);
    const formattedNow = formatCurrentDateTime(timeZone);

    const tomorrowCalendar = await loadCalendarDaySection({
      calendarListHandler: this.calendarListHandler,
      sessionId,
      dayOffset: 1,
      googleConnected,
    });

    if (tomorrowCalendar.kind === 'needs_timezone') {
      return (
        `I can walk you through an evening wind-down once I know your timezone.\n\n` +
        CALENDAR_TIMEZONE_PROMPT
      );
    }

    const sections: string[] = [
      `Here's your evening wind-down.`,
      ``,
      `**Right now**`,
      `${formattedNow} (${timeZone})`,
      ``,
      `**Tomorrow's calendar**`,
      tomorrowCalendar.kind === 'ok'
        ? tomorrowCalendar.text
        : tomorrowCalendar.reason,
    ];

    const location = storedLocation?.trim() ?? '';
    if (location) {
      const weatherText = await loadWeatherSection({
        webSearchTools: this.webSearchTools,
        sessionId,
        location,
        sessionTz,
        query: 'weather tonight and tomorrow',
        userMessage: `weather tonight and tomorrow in ${location}`,
      });
      if (weatherText) {
        sections.push(
          ``,
          `**Weather tonight / tomorrow in ${location}**`,
          weatherText,
        );
      }
    }

    sections.push(
      ``,
      `**Reflect with me**`,
      `1. What mattered today?`,
      `2. What's still open?`,
      `3. What's the one thing for tomorrow?`,
      ``,
      `Reply with any of those — I'll help you capture it, break it down, or plan the next step.`,
    );

    return sections.join('\n');
  }
}
