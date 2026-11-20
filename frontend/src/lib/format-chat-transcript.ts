import type { StoredChatMessage } from '@/lib/session';

/** Plain-text transcript for clipboard copy. */
export function formatChatTranscript(messages: StoredChatMessage[]): string {
  return messages
    .map((m) => {
      const content = m.content.trim();
      if (!content) {
        return null;
      }
      const label = m.role === 'user' ? 'You' : 'Laura';
      return `${label}:\n${content}`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}
