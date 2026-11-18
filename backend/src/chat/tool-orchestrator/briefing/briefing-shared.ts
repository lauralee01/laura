import type { IntentEnvelope } from '../../intent/intent.types';
import { INTENT_CLASSIFICATION_SCHEMA_VERSION } from '../../intent/intent.types';
import { CALENDAR_TIMEZONE_PROMPT } from '../calendar/calendar-timezone.service';
import type { CalendarListHandler } from '../calendar/calendar-list.handler';
import type { WebSearchToolHandler } from '../web-search/web-search-tool.handler';

export function calendarDayEnvelope(dayOffset: number): IntentEnvelope {
  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent: 'calendar_list',
    confidence: 1,
    confidenceKnown: true,
    missingSlots: [],
    slots: {
      mode: 'day',
      dayOffset,
    },
  };
}

export function weatherEnvelope(
  location: string,
  query: string,
): IntentEnvelope {
  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent: 'web_search',
    confidence: 1,
    confidenceKnown: true,
    missingSlots: [],
    slots: {
      query,
      freshness: 'live',
      locationHint: location,
      searchDepth: 'basic',
    },
  };
}

export type CalendarSectionResult =
  | { kind: 'ok'; text: string }
  | { kind: 'needs_timezone' }
  | { kind: 'skipped'; reason: string };

export async function loadCalendarDaySection(params: {
  calendarListHandler: CalendarListHandler;
  sessionId: string;
  dayOffset: number;
  googleConnected: boolean;
}): Promise<CalendarSectionResult> {
  if (!params.googleConnected) {
    return {
      kind: 'skipped',
      reason:
        'Connect Google in the app to include your calendar in briefings.',
    };
  }

  const calendarText =
    await params.calendarListHandler.handleCalendarListIntent(
      params.sessionId,
      calendarDayEnvelope(params.dayOffset),
    );

  if (calendarText.trim() === CALENDAR_TIMEZONE_PROMPT.trim()) {
    return { kind: 'needs_timezone' };
  }

  return { kind: 'ok', text: calendarText.trim() };
}

export async function loadWeatherSection(params: {
  webSearchTools: WebSearchToolHandler;
  sessionId: string;
  location: string;
  sessionTz: string | null;
  query: string;
  userMessage: string;
}): Promise<string | null> {
  try {
    const result = await params.webSearchTools.handleWebSearchIntent(
      params.sessionId,
      params.userMessage,
      weatherEnvelope(params.location, params.query),
      undefined,
      { location: params.location, timeZone: params.sessionTz },
    );

    if (result.kind !== 'reply' || !result.text?.trim()) {
      return null;
    }

    return result.text.trim();
  } catch {
    return null;
  }
}
