export type WebSearchToolResult =
  | { kind: 'reply'; text: string }
  | { kind: 'needs_location' };
