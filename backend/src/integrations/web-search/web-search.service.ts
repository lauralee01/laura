import { Injectable } from '@nestjs/common';

export type WebSearchResult = {
    title: string;
    url: string;
    content: string;
    score?: number;
};

export type WebSearchResponse = {
    answer?: string;
    results: WebSearchResult[];
};

export type WebSearchOptions = {
    searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
    maxResults?: number;
};

type TavilySearchApiResponse = {
    answer?: unknown;
    results?: Array<{
        title?: unknown;
        url?: unknown;
        content?: unknown;
        score?: unknown;
    }>;
};

@Injectable()
export class WebSearchService {
    async search(
        query: string,
        options: WebSearchOptions = {},
    ): Promise<WebSearchResponse> {
        const apiKey = process.env.TAVILY_API_KEY?.trim();

        if (!apiKey) {
            throw new Error('TAVILY_API_KEY is missing');
        }

        const q = query.trim();

        if (!q) {
            throw new Error('Search query is required');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);

        let res: Response;

        try {
            res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    query: q,
                    search_depth: options.searchDepth ?? 'basic',
                    include_answer: true,
                    include_raw_content: false,
                    max_results: Math.max(
                        1,
                        Math.min(options.maxResults ?? 5, 20),
                    ),
                }),
            });
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                error.name === 'AbortError'
            ) {
                throw new Error('Tavily search timed out');
            }

            throw error;
        } finally {
            clearTimeout(timeout);
        }

        const rawText = await res.text();

        if (!res.ok) {
            throw new Error(
                `Tavily search failed (${res.status}). ${rawText.slice(0, 300)}`,
            );
        }

        let data: TavilySearchApiResponse;

        try {
            data = JSON.parse(rawText) as TavilySearchApiResponse;
        } catch {
            throw new Error('Tavily returned an invalid JSON response');
        }

        const results = Array.isArray(data.results)
            ? data.results
                .map((result) => ({
                    title:
                        typeof result.title === 'string'
                            ? result.title.trim()
                            : '',
                    url:
                        typeof result.url === 'string'
                            ? result.url.trim()
                            : '',
                    content:
                        typeof result.content === 'string'
                            ? result.content.trim()
                            : '',
                    score:
                        typeof result.score === 'number'
                            ? result.score
                            : undefined,
                }))
                .filter((result) => result.title && result.url)
            : [];

        return {
            answer:
                typeof data.answer === 'string'
                    ? data.answer.trim()
                    : undefined,
            results,
        };
    }
}