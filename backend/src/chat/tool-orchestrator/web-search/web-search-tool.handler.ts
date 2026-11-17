import { Injectable } from '@nestjs/common';
import { LlmService } from '../../../llm/llm.service';
import { WebSearchService } from '../../../integrations/web-search/web-search.service';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import {
  buildCurrentContext,
  DEFAULT_WEB_SEARCH_TIME_ZONE,
} from './web-search-context';
import {
  buildSearchQuery,
  getFreshness,
  getLocationHint,
  getSearchDepth,
  getSearchQuery,
  resolveLocationHint,
} from './web-search-query';
import {
  buildSynthesisUserMessage,
  formatSourcesForPrompt,
  synthesizeWebSearchReply,
} from './web-search-synthesis';
import type {
  WebSearchSessionContext,
  WebSearchToolResult,
} from './web-search-tool.types';

export type {
  WebSearchSessionContext,
  WebSearchToolResult,
} from './web-search-tool.types';

@Injectable()
export class WebSearchToolHandler {
  constructor(
    private readonly webSearch: WebSearchService,
    private readonly llm: LlmService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) {}

  async handleWebSearchIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
    onChunk?: (chunk: string) => void,
    sessionContext?: WebSearchSessionContext,
  ): Promise<WebSearchToolResult> {
    try {
      const rawQuery = getSearchQuery(message, envelope);
      const rawLocationHint = getLocationHint(envelope);

      /*
       * Prefer caller-prefetched prefs (chat bootstrap) so we do not
       * pay another Redis round-trip on the hot web-search path.
       */
      let storedLocation: string | null;
      let storedTimeZone: string | null;
      if (sessionContext) {
        storedLocation = sessionContext.location;
        storedTimeZone = sessionContext.timeZone;
      } else {
        [storedLocation, storedTimeZone] = await Promise.all([
          this.sessionPreferences.getLocation(sessionId),
          this.sessionPreferences.getTimeZone(sessionId),
        ]);
      }

      const locationHint = resolveLocationHint(
        rawLocationHint,
        storedLocation,
      );
      if (locationHint === null) {
        return { kind: 'needs_location' };
      }

      const freshness = getFreshness(envelope);
      const searchDepth = getSearchDepth(envelope);
      const timeZone = storedTimeZone?.trim() || DEFAULT_WEB_SEARCH_TIME_ZONE;
      const searchQuery = buildSearchQuery(rawQuery, locationHint);
      const currentContext = buildCurrentContext({ freshness, timeZone });

      const search = await this.webSearch.search(searchQuery, {
        searchDepth,
        maxResults: 5,
      });

      if (!search.results.length && !search.answer) {
        return {
          kind: 'reply',
          text:
            `I couldn't find reliable results for that yet. ` +
            `Try asking with a city, date, team, or more specific detail.`,
        };
      }

      const synthesisUserMessage = buildSynthesisUserMessage({
        message,
        searchQuery,
        currentContext,
        locationHint,
        searchAnswer: search.answer,
        sources: formatSourcesForPrompt(search.results),
      });

      const { text, streamed } = await synthesizeWebSearchReply(
        this.llm,
        synthesisUserMessage,
        onChunk,
      );

      return streamed
        ? { kind: 'reply', text, streamed: true }
        : { kind: 'reply', text };
    } catch (error: unknown) {
      return {
        kind: 'reply',
        text: formatToolFailureMessage('search the web', error),
      };
    }
  }
}
