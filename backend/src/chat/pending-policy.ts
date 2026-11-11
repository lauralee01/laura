import type { IntentId } from './intent/intent.types';
import type {
  PendingActionType,
  ToolPendingMap,
  WebSearchMissingLocationPending,
} from './session-pending.types';

export type IntentFamily =
  | 'email'
  | 'calendar'
  | 'web_search'
  | 'chat'
  | 'pending_control'
  | 'timezone'
  | 'unknown';

const INTENT_FAMILY: Record<IntentId, IntentFamily> = {
  email_draft: 'email',
  email_send_confirm: 'email',
  email_draft_revise: 'email',
  email_draft_delete: 'email',
  calendar_list: 'calendar',
  calendar_create: 'calendar',
  calendar_update: 'calendar',
  calendar_delete: 'calendar',
  morning_briefing: 'calendar',
  web_search: 'web_search',
  current_datetime: 'chat',
  general_chat: 'chat',
  clarify: 'chat',
  pending_confirm: 'pending_control',
  pending_cancel: 'pending_control',
  set_timezone: 'timezone',
};

const PENDING_ACTION_FAMILY: Record<PendingActionType, IntentFamily> = {
  email_draft: 'email',
  email_send: 'email',
  calendar_list: 'calendar',
  calendar_create: 'calendar',
  calendar_update: 'calendar',
  calendar_delete: 'calendar',
  calendar_mutate_tz: 'calendar',
};

export function familyForIntent(intent?: IntentId): IntentFamily {
  if (!intent) return 'unknown';
  return INTENT_FAMILY[intent] ?? 'unknown';
}

export function familyForPendingAction(
  actionType: PendingActionType,
): IntentFamily {
  return PENDING_ACTION_FAMILY[actionType];
}

export type SessionPendingSnapshot = {
  tools: ToolPendingMap;
  webSearch: WebSearchMissingLocationPending | null;
};

/**
 * Pending actions whose family differs from the Stage-1 intent should be
 * cleared so a new topic is not swallowed by a stale multi-turn tool flow.
 *
 * Same-family and control intents (confirm/cancel/timezone) keep pending.
 */
export function pendingActionsInterruptedByIntent(
  tools: ToolPendingMap,
  intent?: IntentId,
): PendingActionType[] {
  const intentFamily = familyForIntent(intent);

  if (
    intentFamily === 'unknown' ||
    intentFamily === 'pending_control' ||
    intentFamily === 'timezone'
  ) {
    return [];
  }

  const interrupted: PendingActionType[] = [];

  for (const actionType of Object.keys(tools) as PendingActionType[]) {
    if (!tools[actionType]) continue;
    const pendingFamily = familyForPendingAction(actionType);
    if (pendingFamily !== intentFamily) {
      interrupted.push(actionType);
    }
  }

  return interrupted;
}

export function shouldClearWebSearchLocationPending(
  intent?: IntentId,
): boolean {
  const family = familyForIntent(intent);
  if (family === 'pending_control' && intent === 'pending_cancel') {
    return true;
  }
  return (
    family === 'calendar' ||
    family === 'email' ||
    family === 'chat' && intent === 'current_datetime'
  );
}

/**
 * Whether a web_search_missing_location pending should treat this turn as the
 * location answer (vs clearing and routing freshly).
 */
export function shouldResumeWebSearchLocation(
  intent?: IntentId,
): boolean {
  if (!intent) return true;
  if (shouldClearWebSearchLocationPending(intent)) return false;
  const family = familyForIntent(intent);
  return (
    family === 'web_search' ||
    family === 'chat' ||
    family === 'pending_control' ||
    family === 'timezone' ||
    family === 'unknown'
  );
}

export function buildPendingHintFromSnapshot(
  snapshot: SessionPendingSnapshot,
): string | undefined {
  const parts: string[] = [];
  const { tools, webSearch } = snapshot;

  if (webSearch?.type === 'web_search_missing_location') {
    parts.push(
      'Pending: web search waiting for the user town/city location.',
    );
  }
  if (tools.email_send) {
    parts.push(
      'Pending: email send confirmation (draft ready; user should confirm send, revise, or cancel).',
    );
  }
  if (tools.email_draft) {
    parts.push(
      'Pending: email draft missing recipient or body (user is supplying draft details).',
    );
  }
  if (tools.calendar_delete) {
    parts.push('Pending: calendar event delete (pick event or confirm delete).');
  }
  if (tools.calendar_update) {
    parts.push('Pending: calendar event update (pick which event to update).');
  }
  if (tools.calendar_create) {
    parts.push('Pending: calendar create blocked on timezone or details.');
  }
  if (tools.calendar_list) {
    parts.push('Pending: calendar list blocked on timezone.');
  }
  if (tools.calendar_mutate_tz) {
    parts.push('Pending: calendar change/delete blocked on timezone.');
  }

  if (parts.length === 0) return undefined;
  return parts.join(' ');
}

export function hasCalendarPending(tools: ToolPendingMap): boolean {
  return Boolean(
    tools.calendar_update ||
      tools.calendar_delete ||
      tools.calendar_create ||
      tools.calendar_list ||
      tools.calendar_mutate_tz,
  );
}
