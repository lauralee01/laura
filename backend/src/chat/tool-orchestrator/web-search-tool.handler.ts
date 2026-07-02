import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { WebSearchService } from '../../integrations/web-search/web-search.service';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
import type { IntentEnvelope } from '../intent/intent.types';

function getSearchQuery(message: string, envelope?: IntentEnvelope): string {
    const slots = envelope?.slots ?? {};
    const q = slots.query;
    if (typeof q === 'string' && q.trim()) {
        return q.trim();
    }
    return message.trim();
}

@Injectable()
export class WebSearchToolHandler {
    constructor(
        private readonly webSearch: WebSearchService,
        private readonly llm: LlmService,
    ) { }

    async handleWebSearchIntent(
        message: string,
        envelope?: IntentEnvelope,
    ): Promise<string> {
        try {
            const query = getSearchQuery(message, envelope);
            const search = await this.webSearch.search(query);

            if (!search.results.length && !search.answer) {
                return (
                    `I couldn't find reliable live results for that yet. ` +
                    `Try asking with a city, date, team, or more specific detail.`
                );
            }

            const sources = search.results
                .slice(0, 5)
                .map(
                    (r, i) =>
                        `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`,
                )
                .join('\n\n');

            const systemPrompt =
                'You are Laura, a calm and practical personal assistant. ' +
                'Use the provided web search results to answer the user clearly. ' +
                'Do not invent facts not supported by the search results. ' +
                'If the results are uncertain or incomplete, say so naturally. ' +
                'Keep the answer concise, useful, and assistant-like. ' +
                'Include a short "Sources" section with the source titles and URLs.';

            const userMessage =
                `User asked: ${message}\n\n` +
                (search.answer ? `Search answer: ${search.answer}\n\n` : '') +
                `Search results:\n${sources}`;

            return this.llm.generate({
                systemPrompt,
                userMessage,
            });
        } catch (e: unknown) {
            return formatToolFailureMessage('search the web', e);
        }
    }
}