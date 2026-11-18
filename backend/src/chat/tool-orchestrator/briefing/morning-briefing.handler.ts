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
export class MorningBriefingHandler {
  constructor(
    private readonly calendarListHandler: CalendarListHandler,
    private readonly webSearchTools: WebSearchToolHandler,
  ) {}

  async handleMorningBriefing(
    sessionId: string,
    sessionTz: string | null,
    storedLocation: string | null,
    googleConnected = false,
  ): Promise<string> {
    const timeZone = resolveSessionTimeZone(sessionTz);
    const formattedNow = formatCurrentDateTime(timeZone);

    const calendar = await loadCalendarDaySection({
      calendarListHandler: this.calendarListHandler,
      sessionId,
      dayOffset: 0,
      googleConnected,
    });

    /*
     * Timezone ask must win alone — pending resume completes calendar_list,
     * same as a normal list turn. Don't tack on weather yet.
     */
    if (calendar.kind === 'needs_timezone') {
      return (
        `I can put together your morning briefing once I know your timezone.\n\n` +
        CALENDAR_TIMEZONE_PROMPT
      );
    }

    const sections: string[] = [
      `Here's your morning briefing.`,
      ``,
      `**Right now**`,
      `${formattedNow} (${timeZone})`,
      ``,
      `**Today's calendar**`,
      calendar.kind === 'ok' ? calendar.text : calendar.reason,
    ];

    const location = storedLocation?.trim() ?? '';
    if (location) {
      const weatherText = await loadWeatherSection({
        webSearchTools: this.webSearchTools,
        sessionId,
        location,
        sessionTz,
        query: 'weather today',
        userMessage: `weather today in ${location}`,
      });
      if (weatherText) {
        sections.push(``, `**Weather in ${location}**`, weatherText);
      }
    }

    sections.push(
      ``,
      `**Make today count**`,
      `What's the one thing that would make today a win? Tell me and I'll help you protect time for it.`,
    );

    return sections.join('\n');
  }
}
