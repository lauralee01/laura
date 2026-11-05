export type ChatPerfLog = {
  type: 'tool' | 'llm_generation';
  intent: string;
  /**
   * Wall time for the parallel bootstrap (ensureConversation + prefs + tools).
   * Same window as prefetchMs after speed-3; kept for log continuity.
   */
  ensureConversationMs: number;
  /** Parallel ensureConversation + session prefs + tools. */
  prefetchMs: number;
  /** DB history load when the client did not send turns (0 when skipped). */
  historyMs: number;
  /** Stage-1 intent classifier LLM (overlaps Google OAuth prefetch). */
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
