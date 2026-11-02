import type { PendingRequestService } from '../pending-request.service';

/**
 * Short text for the classifier so “yes” / “cancel” are interpreted with pending context.
 * Snapshot **before** `tryHandle` runs (same turn the user message applies to).
 */
export async function buildPendingHintForClassifier(
  sessionId: string,
  pending: PendingRequestService,
): Promise<string | undefined> {
  const sid = sessionId.trim();
  if (!sid) return undefined;

  const parts: string[] = [];

  if (await pending.getPending(sid, 'email_send')) {
    parts.push(
      'Pending: email send confirmation (draft ready; user should confirm send, revise, or cancel).',
    );
  }
  if (await pending.getPending(sid, 'email_draft')) {
    parts.push(
      'Pending: email draft missing recipient or body (user is supplying draft details).',
    );
  }
  if (await pending.getPending(sid, 'calendar_delete')) {
    parts.push('Pending: calendar event delete (pick event or confirm delete).');
  }
  if (await pending.getPending(sid, 'calendar_update')) {
    parts.push('Pending: calendar event update (pick which event to update).');
  }
  if (await pending.getPending(sid, 'calendar_create')) {
    parts.push('Pending: calendar create blocked on timezone or details.');
  }
  if (await pending.getPending(sid, 'calendar_list')) {
    parts.push('Pending: calendar list blocked on timezone.');
  }
  if (await pending.getPending(sid, 'calendar_mutate_tz')) {
    parts.push('Pending: calendar change/delete blocked on timezone.');
  }

  if (parts.length === 0) return undefined;
  return parts.join(' ');
}
