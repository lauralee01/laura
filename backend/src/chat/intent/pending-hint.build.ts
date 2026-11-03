import {
  buildPendingHintFromSnapshot,
  type SessionPendingSnapshot,
} from '../pending-policy';
import type { PendingRequestService } from '../pending-request.service';
import type { WebSearchMissingLocationPending } from '../session-pending.types';

/**
 * Short text for the classifier so “yes” / “cancel” are interpreted with pending context.
 * Prefer {@link buildPendingHintFromSnapshot} when the caller already loaded pending once.
 */
export async function buildPendingHintForClassifier(
  sessionId: string,
  pending: PendingRequestService,
  webSearch?: WebSearchMissingLocationPending | null,
): Promise<string | undefined> {
  const sid = sessionId.trim();
  if (!sid) return undefined;

  const snapshot: SessionPendingSnapshot = {
    tools: await pending.snapshotTools(sid),
    webSearch: webSearch ?? null,
  };

  return buildPendingHintFromSnapshot(snapshot);
}

export { buildPendingHintFromSnapshot };
