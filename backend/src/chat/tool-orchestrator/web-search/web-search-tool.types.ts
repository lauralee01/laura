export type WebSearchToolResult =
  | {
      kind: 'reply';
      text: string;
      /** True when synthesis tokens were already pushed via onChunk. */
      streamed?: boolean;
    }
  | { kind: 'needs_location' };

/** Prefetched session prefs so web search skips a second Redis round-trip. */
export type WebSearchSessionContext = {
  location: string | null;
  timeZone: string | null;
};
