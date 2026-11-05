import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { LlmService } from '../../../llm/llm.service';
import { WebSearchService } from '../../../integrations/web-search/web-search.service';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import type { WebSearchToolResult } from './web-search-tool.types';

const USER_CURRENT_LOCATION = 'USER_CURRENT_LOCATION';
const DEFAULT_TIME_ZONE = 'America/Chicago';

export type { WebSearchToolResult } from './web-search-tool.types';

type SearchFreshness = 'live' | 'recent' | 'general';
type SearchDepth = 'basic' | 'advanced';

function getSearchQuery(
    message: string,
    envelope?: IntentEnvelope,
): string {
    const query = envelope?.slots?.query;

    if (typeof query === 'string' && query.trim()) {
        return query.trim();
    }

    return message.trim();
}

function getFreshness(
    envelope?: IntentEnvelope,
): SearchFreshness {
    const freshness = envelope?.slots?.freshness;

    if (
        freshness === 'live' ||
        freshness === 'recent' ||
        freshness === 'general'
    ) {
        return freshness;
    }

    return 'general';
}

function getSearchDepth(
    envelope?: IntentEnvelope,
): SearchDepth {
    return envelope?.slots?.searchDepth === 'advanced'
        ? 'advanced'
        : 'basic';
}

function getLocationHint(
    envelope?: IntentEnvelope,
): string {
    const locationHint = envelope?.slots?.locationHint;

    if (typeof locationHint !== 'string') {
        return '';
    }

    return locationHint.trim();
}

function buildSearchQuery(
    query: string,
    locationHint: string,
): string {
    if (!locationHint) {
        return query;
    }

    return `${query} in ${locationHint}`;
}

function buildCurrentContext(input: {
    freshness: SearchFreshness;
    timeZone: string;
}): string | null {
    if (
        input.freshness !== 'live' &&
        input.freshness !== 'recent'
    ) {
        return null;
    }

    const now = DateTime.now().setZone(input.timeZone);

    return [
        `Today is ${now.toFormat('cccc, LLLL d, yyyy')}.`,
        `Current timezone: ${input.timeZone}.`,
        'Use current information for this date when the request is date-sensitive.',
        'Prefer official or highly reliable sources.',
    ].join('\n');
}

function formatSourcesForPrompt(
    results: Array<{
        title: string;
        url: string;
        content: string;
    }>,
): string {
    return results
        .slice(0, 5)
        .map(
            (result, index) =>
                [
                    `Source ${index + 1}`,
                    `Title: ${result.title}`,
                    `URL: ${result.url}`,
                    `Snippet: ${result.content}`,
                ].join('\n'),
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
        onChunk?: (chunk: string) => void,
    ): Promise<WebSearchToolResult> {
        try {
            const rawQuery = getSearchQuery(message, envelope);
            const rawLocationHint = getLocationHint(envelope);

            const [storedLocation, storedTimeZone] =
                await Promise.all([
                    this.sessionPreferences.getLocation(sessionId),
                    this.sessionPreferences.getTimeZone(sessionId),
                ]);

            if (
                rawLocationHint === USER_CURRENT_LOCATION &&
                !storedLocation
            ) {
                return { kind: 'needs_location' };
            }

            const locationHint =
                rawLocationHint === USER_CURRENT_LOCATION
                    ? storedLocation ?? ''
                    : rawLocationHint;

            const freshness = getFreshness(envelope);
            const searchDepth = getSearchDepth(envelope);

            const timeZone =
                storedTimeZone?.trim() || DEFAULT_TIME_ZONE;

            const searchQuery = buildSearchQuery(
                rawQuery,
                locationHint,
            );

            const currentContext = buildCurrentContext({
                freshness,
                timeZone,
            });

            const search = await this.webSearch.search(
                searchQuery,
                {
                    searchDepth,
                    maxResults: 5,
                },
            );

            if (!search.results.length && !search.answer) {
                return {
                    kind: 'reply',
                    text:
                        `I couldn't find reliable results for that yet. ` +
                        `Try asking with a city, date, team, or more specific detail.`,
                };
            }

            const sources = formatSourcesForPrompt(
                search.results,
            );

            const systemPrompt = [
                'You are Laura, a calm, practical personal assistant.',
                'Answer the user using only the provided web search answer and sources.',
                'Do not invent facts, schedules, scores, dates, times, prices, ratings, or availability that are not supported by the sources.',
                'Preserve dates, times, names, locations, and event details exactly as supported by the sources.',
                'If the sources do not clearly answer the question, say that clearly and explain what you could verify.',
                'For date-sensitive questions, only describe information as current or happening today when the sources support it.',
                'If a location constraint is provided, only include results relevant to that location.',
                'If the results are mostly for the wrong location, say you could not verify good local results instead of presenting irrelevant results.',
                'For sports questions, prioritize official tournament, federation, league, or major sports-news sources.',
                'Check publication dates and event dates carefully.',
                'If reliable sources conflict, do not silently choose one. Explain the conflict and what the most recent authoritative source supports.',
                'Do not infer current status from older qualification, advancement, preview, or historical information.',
                'Keep the answer concise and useful, but always finish complete sentences.',
                'Use Markdown where appropriate, but do not use markdown headings or raw markdown tables.',
                'Do not expose URLs in the main body of the answer.',
                'After the answer, include a **Sources** section containing no more than three provided source URLs.',
                'Never invent, modify, or shorten source URLs.',
                'Never stop mid-sentence or mid-list. Always complete the answer and the Sources section.',
            ].join(' ');

            const userMessageParts = [
                `User asked:\n${message}`,
                `Search query used:\n${searchQuery}`,
            ];

            if (currentContext) {
                userMessageParts.push(
                    `Current context:\n${currentContext}`,
                );
            }

            if (locationHint) {
                userMessageParts.push(
                    `Location constraint:\n${locationHint}`,
                );
            }

            if (search.answer) {
                userMessageParts.push(
                    `Search answer:\n${search.answer}`,
                );
            }

            userMessageParts.push(
                `Search sources:\n${sources}`,
            );

            const synthesisInput = {
                systemPrompt,
                userMessage: userMessageParts.join('\n\n'),
                /*
                 * Synthesis needs room for answer + Sources. Disable thinking
                 * so the budget is not eaten before the visible reply finishes.
                 */
                maxOutputTokens: 4096,
                thinkingBudget: 0 as const,
                errorMode: 'throw' as const,
            };

            /*
             * Stream synthesis when the chat SSE path provides onChunk so the
             * user sees tokens after Tavily returns, not after the full draft.
             */
            if (onChunk) {
                const text = await this.llm.generateStream(
                    synthesisInput,
                    onChunk,
                );
                return { kind: 'reply', text, streamed: true };
            }

            const text = await this.llm.generate(synthesisInput);
            return { kind: 'reply', text };
        } catch (error: unknown) {
            return {
                kind: 'reply',
                text: formatToolFailureMessage(
                    'search the web',
                    error,
                ),
            };
        }
    }
}