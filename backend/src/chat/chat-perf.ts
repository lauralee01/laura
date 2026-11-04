export type ChatPerfLog = {
  type: 'tool' | 'llm_generation';
  intent: string;
  /** Time to ensure/create the conversation row. */
  ensureConversationMs: number;
  /** Parallel session/pending/history prefetch. */
  prefetchMs: number;
  /** Stage-1 intent classifier LLM. */
  intentMs: number;
  /** Embedding memory retrieve (0 when skipped). */
  memoryMs: number;
  memorySkipped: boolean;
  /** OAuth / pending / intent switch dispatch (tool path). */
  routeMs?: number;
  /** Final chat LLM generation (chat path). */
  llmMs?: number;
  /** Time to first streamed/chunked token from request start. */
  ttftMs: number;
  totalMs: number;
};

export function logChatPerf(perf: ChatPerfLog): void {
  console.log('[CHAT PERF]', perf);
}
