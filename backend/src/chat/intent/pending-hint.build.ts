import type { PendingRequestService } from '../pending-request.service';

/**
 * Short text for the classifier so “yes” / “cancel” are interpreted with pending context.
 * Snapshot **before** `tryHandle` runs (same turn the user message applies to).
 */
export function buildPendingHintForClassifier(
  sessionId: string,
  pending: PendingRequestService,
): string | undefined {
  const sid = sessionId.trim();
  if (!sid) return undefined;

  const parts: string[] = [];

  if (pending.getPending(sid, 'email_send')) {
    parts.push('Pending: email send confirmation (draft ready; user should confirm send, revise, or cancel).');
  }
  if (pending.getPending(sid, 'calendar_delete')) {
    parts.push('Pending: calendar event delete (pick event or confirm delete).');
  }
  if (pending.getPending(sid, 'calendar_update')) {
    parts.push('Pending: calendar event update (pick which event to update).');
  }
  if (pending.getPending(sid, 'calendar_create')) {
    parts.push('Pending: calendar create blocked on timezone or details.');
  }
  if (pending.getPending(sid, 'calendar_list')) {
    parts.push('Pending: calendar list blocked on timezone.');
  }
  if (pending.getPending(sid, 'calendar_mutate_tz')) {
    parts.push('Pending: calendar change/delete blocked on timezone.');
  }

  if (parts.length === 0) return undefined;
  return parts.join(' ');
}
