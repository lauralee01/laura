export type WebSearchToolResult =
  | {
      kind: 'reply';
      text: string;
      /** True when synthesis tokens were already pushed via onChunk. */
      streamed?: boolean;
    }
  | { kind: 'needs_location' };
