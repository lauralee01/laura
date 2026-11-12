import type { IntentId } from './intent/intent.types';
import { hasCalendarPending } from './pending-policy';
import type { ToolPendingMap } from './session-pending.types';

const INTENT_STATUS_LABELS: Partial<Record<IntentId, string>> = {
  web_search: 'Searching the web…',
  calendar_list: 'Checking your calendar…',
  calendar_create: 'Working with your calendar…',
  calendar_update: 'Working with your calendar…',
  calendar_delete: 'Working with your calendar…',
  morning_briefing: 'Preparing your briefing…',
  email_draft: 'Working on your email…',
  email_draft_revise: 'Working on your email…',
  email_draft_delete: 'Working on your email…',
  email_send_confirm: 'Working on your email…',
};

/**
 * One-shot thinking-bubble label for tool turns (SSE `status`).
 * Returns undefined for chat-like intents and near-instant datetime.
 */
export function labelForToolIntent(
  intent: IntentId | undefined,
): string | undefined {
  if (!intent) {
    return undefined;
  }
  return INTENT_STATUS_LABELS[intent];
}

/**
 * Prefer Stage-1 intent label; fall back to active pending tool family
 * (e.g. user supplies an email address while email_draft is pending).
 */
export function labelForToolTurn(
  intent: IntentId | undefined,
  toolPending: ToolPendingMap,
): string | undefined {
  const fromIntent = labelForToolIntent(intent);
  if (fromIntent) {
    return fromIntent;
  }

  if (toolPending.email_send || toolPending.email_draft) {
    return 'Working on your email…';
  }

  if (hasCalendarPending(toolPending)) {
    return 'Working with your calendar…';
  }

  if (intent === 'pending_confirm' || intent === 'pending_cancel') {
    return 'Working on that…';
  }

  return undefined;
}
