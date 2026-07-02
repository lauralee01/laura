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

@Injectable()
export class WebSearchService {
    async search(query: string): Promise<WebSearchResponse> {
        const apiKey = process.env.TAVILY_API_KEY?.trim();

        if (!apiKey) {
            throw new Error('TAVILY_API_KEY is missing');
        }

        const q = query.trim();
        if (!q) {
            throw new Error('Search query is required');
        }

        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query: q,
                search_depth: 'basic',
                include_answer: true,
                include_raw_content: false,
                max_results: 5,
            }),
        });

        const rawText = await res.text();

        if (!res.ok) {
            throw new Error(
                `Tavily search failed (${res.status}). ${rawText.slice(0, 300)}`,
            );
        }

        const data = JSON.parse(rawText) as {
            answer?: unknown;
            results?: Array<{
                title?: unknown;
                url?: unknown;
                content?: unknown;
                score?: unknown;
            }>;
        };

        return {
            answer: typeof data.answer === 'string' ? data.answer : undefined,
            results: Array.isArray(data.results)
                ? data.results
                    .map((r) => ({
                        title: typeof r.title === 'string' ? r.title : '',
                        url: typeof r.url === 'string' ? r.url : '',
                        content: typeof r.content === 'string' ? r.content : '',
                        score: typeof r.score === 'number' ? r.score : undefined,
                    }))
                    .filter((r) => r.title && r.url)
                : [],
        };
    }
}