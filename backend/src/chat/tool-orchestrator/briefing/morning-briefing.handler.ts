import { Injectable } from '@nestjs/common';
import {
  formatCurrentDateTime,
  resolveSessionTimeZone,
} from '../../datetime-context';
import type { IntentEnvelope } from '../../intent/intent.types';
import { INTENT_CLASSIFICATION_SCHEMA_VERSION } from '../../intent/intent.types';
import { CALENDAR_TIMEZONE_PROMPT } from '../calendar/calendar-timezone.service';
import { CalendarListHandler } from '../calendar/calendar-list.handler';
import { WebSearchToolHandler } from '../web-search/web-search-tool.handler';

function todayCalendarEnvelope(): IntentEnvelope {
  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent: 'calendar_list',
    confidence: 1,
    confidenceKnown: true,
    missingSlots: [],
    slots: {
      mode: 'day',
      dayOffset: 0,
    },
  };
}

function weatherEnvelope(location: string): IntentEnvelope {
  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent: 'web_search',
    confidence: 1,
    confidenceKnown: true,
    missingSlots: [],
    slots: {
      query: 'weather today',
      freshness: 'live',
      locationHint: location,
      searchDepth: 'basic',
    },
  };
}

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
  ): Promise<string> {
    const timeZone = resolveSessionTimeZone(sessionTz);
    const formattedNow = formatCurrentDateTime(timeZone);

    const calendarText =
      await this.calendarListHandler.handleCalendarListIntent(
        sessionId,
        todayCalendarEnvelope(),
      );

    /*
     * Timezone ask must win alone — pending resume completes calendar_list,
     * same as a normal list turn. Don't tack on weather yet.
     */
    if (calendarText.trim() === CALENDAR_TIMEZONE_PROMPT.trim()) {
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
      calendarText.trim(),
    ];

    const location = storedLocation?.trim() ?? '';
    if (location) {
      const weatherText = await this.tryWeatherSection(
        sessionId,
        location,
        sessionTz,
      );
      if (weatherText) {
        sections.push(``, `**Weather in ${location}**`, weatherText);
      }
    }

    return sections.join('\n');
  }

  private async tryWeatherSection(
    sessionId: string,
    location: string,
    sessionTz: string | null,
  ): Promise<string | null> {
    try {
      const result = await this.webSearchTools.handleWebSearchIntent(
        sessionId,
        `weather today in ${location}`,
        weatherEnvelope(location),
        undefined,
        { location, timeZone: sessionTz },
      );

      if (result.kind !== 'reply' || !result.text?.trim()) {
        return null;
      }

      return result.text.trim();
    } catch {
      return null;
    }
  }
}
