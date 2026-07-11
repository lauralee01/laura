import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { LlmService } from '../../../llm/llm.service';
import { WebSearchService } from 'src/integrations/web-search/web-search.service';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';

const USER_CURRENT_LOCATION = 'USER_CURRENT_LOCATION';

function getSearchQuery(message: string, envelope?: IntentEnvelope): string {
    const slots = envelope?.slots ?? {};
    const q = slots.query;

    if (typeof q === 'string' && q.trim()) {
        return q.trim();
    }

    return message.trim();
}

function getFreshness(envelope?: IntentEnvelope): string {
    const freshness = envelope?.slots?.freshness;

    if (typeof freshness === 'string' && freshness.trim()) {
        return freshness.trim().toLowerCase();
    }

    return 'general';
}

function buildLiveAwareQuery(input: {
    message: string;
    query: string;
    freshness: string;
    timeZone: string;
}): string {
    const now = DateTime.now().setZone(input.timeZone);
    const todayLong = now.toFormat('LLLL d, yyyy');
    const weekday = now.toFormat('cccc');

    const isLive =
        input.freshness === 'live' ||
        input.freshness === 'recent' ||
        /\b(today|tonight|tomorrow|latest|current|now|this week|this weekend|schedule|games|matches|weather|news|open now)\b/i.test(
            input.message,
        );

    if (!isLive) {
        return input.query;
    }

    return [
        input.query,
        `Today is ${weekday}, ${todayLong}.`,
        `Return current information for this exact date when the question is date-sensitive.`,
        `Prefer official or highly reliable sources.`,
        `If the query is about sports, include the league/tournament name, match date, teams, and start times if available.`,
        `If the query is about places, include current availability details only if the source supports them.`,
        `If a location is provided, only return results in that location and ignore other cities or states.`,
    ].join('\n');
}

function formatSourcesForPrompt(
    results: Array<{ title: string; url: string; content: string }>,
): string {
    return results
        .slice(0, 5)
        .map(
            (r, i) =>
                `Source ${i + 1}\nTitle: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`,
        )
        .join('\n\n');
}

@Injectable()
export class WebSearchToolHandler {
    constructor(
        private readonly webSearch: WebSearchService,
        private readonly llm: LlmService,
        private readonly sessionPreferences: SessionPreferencesService,
    ) { }

    async handleWebSearchIntent(
        sessionId: string,
        message: string,
        envelope?: IntentEnvelope,
    ): Promise<string> {
        try {
            const rawQuery = getSearchQuery(message, envelope);

            const rawLocationHint =
                typeof envelope?.slots?.locationHint === 'string'
                    ? envelope.slots.locationHint.trim()
                    : '';

            const storedLocation = await this.sessionPreferences.getLocation?.(sessionId);

            if (rawLocationHint === USER_CURRENT_LOCATION && !storedLocation) {
                return '__WEB_SEARCH_NEEDS_LOCATION__';
            }

            const locationHint =
                rawLocationHint === USER_CURRENT_LOCATION
                    ? storedLocation ?? ''
                    : rawLocationHint || '';

            const rawQueryWithLocation = locationHint
                ? `${rawQuery} in ${locationHint}`
                : rawQuery;

            const freshness = getFreshness(envelope);
            const timeZone = 'America/Chicago';

            const searchQuery = rawQueryWithLocation;

            const contextForAnswer = buildLiveAwareQuery({
                message,
                query: rawQueryWithLocation,
                freshness,
                timeZone,
            });

            const search = await this.webSearch.search(searchQuery, {
                searchDepth:
                    freshness === 'live' || freshness === 'recent'
                        ? 'advanced'
                        : 'basic',
                maxResults: 5,
            });

            if (!search.results.length && !search.answer) {
                return (
                    `I couldn't find reliable live results for that yet. ` +
                    `Try asking with a city, date, team, or more specific detail.`
                );
            }

            const sources = formatSourcesForPrompt(search.results);

            const systemPrompt =
                'You are Laura, a calm, practical personal assistant. ' +
                'Answer the user using only the provided web search answer and sources. ' +
                'Do not invent facts, schedules, scores, dates, times, prices, ratings, or availability that are not supported by the sources. ' +
                'Preserve dates, times, names, locations, and event details exactly as they appear in the provided sources. Do not abbreviate, truncate, or reformat them unless the source already does so. ' +
                'If the sources do not clearly answer the question, say that clearly and explain what you could verify. ' +
                'For date-sensitive questions, be very careful: only say something is happening today if the sources clearly support today’s date. ' +
                'If the user provided a location, only include results for that location. ' +
                'Do not include businesses, events, restaurants, salons, or places from other cities or states. ' +
                'If the search results are mostly from the wrong location, say you could not verify good local results instead of giving irrelevant results. ' +
                'Keep the answer concise and useful. ' +
                'Use Markdown for formatting where appropriate (lists, bold text, emphasis). ' +
                'Do not use markdown headings like ### or ##. ' +
                'Do not use raw markdown tables. ' +
                'Do not expose URLs anywhere in the main body of the answer. ' +
                'After the answer, include a Markdown **Sources** section exactly like this:\n\n' +
                '**Sources**\n' +
                '- [Source Title 1](https://example.com)\n' +
                '- [Source Title 2](https://example.com)\n\n' +
                'Only use URLs that appear in the provided search results. ' +
                'Never invent, modify, or shorten URLs. ' +
                'Include no more than three sources. ' +
                'Do not place source URLs anywhere except inside the Sources section.';

            const userMessage =
                `User asked: ${message}\n\n` +
                `Search query used:\n${searchQuery}\n\n` +
                `Answering instructions:\n${contextForAnswer}\n\n` +
                (locationHint ? `Location constraint: ${locationHint}\n\n` : '') +
                (search.answer ? `Search answer:\n${search.answer}\n\n` : '') +
                `Search sources:\n${sources}`;

            return this.llm.generate({
                systemPrompt,
                userMessage,
            });
        } catch (e: unknown) {
            return formatToolFailureMessage('search the web', e);
        }
    }
}