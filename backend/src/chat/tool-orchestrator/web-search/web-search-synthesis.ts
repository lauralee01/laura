import type { LlmService } from '../../../llm/llm.service';

const SYNTHESIS_SYSTEM_PROMPT = [
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

export function formatSourcesForPrompt(
  results: Array<{
    title: string;
    url: string;
    content: string;
  }>,
): string {
  return results
    .slice(0, 5)
    .map((result, index) =>
      [
        `Source ${index + 1}`,
        `Title: ${result.title}`,
        `URL: ${result.url}`,
        `Snippet: ${result.content}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function buildSynthesisUserMessage(input: {
  message: string;
  searchQuery: string;
  currentContext: string | null;
  locationHint: string;
  searchAnswer?: string | null;
  sources: string;
}): string {
  const parts = [
    `User asked:\n${input.message}`,
    `Search query used:\n${input.searchQuery}`,
  ];

  if (input.currentContext) {
    parts.push(`Current context:\n${input.currentContext}`);
  }

  if (input.locationHint) {
    parts.push(`Location constraint:\n${input.locationHint}`);
  }

  if (input.searchAnswer) {
    parts.push(`Search answer:\n${input.searchAnswer}`);
  }

  parts.push(`Search sources:\n${input.sources}`);

  return parts.join('\n\n');
}

export async function synthesizeWebSearchReply(
  llm: LlmService,
  userMessage: string,
  onChunk?: (chunk: string) => void,
): Promise<{ text: string; streamed: boolean }> {
  const synthesisInput = {
    systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
    userMessage,
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
    const text = await llm.generateStream(synthesisInput, onChunk);
    return { text, streamed: true };
  }

  const text = await llm.generate(synthesisInput);
  return { text, streamed: false };
}
