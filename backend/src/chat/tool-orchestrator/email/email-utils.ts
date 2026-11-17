import type { IntentEnvelope } from '../../intent/intent.types';

/** True when the user wants the Gmail draft removed, not just send cancelled. */
export function isEmailDraftDeleteRequest(
  message: string,
  envelope?: IntentEnvelope,
): boolean {
  if (envelope?.intent === 'email_draft_delete') {
    return true;
  }

  const action = envelope?.slots?.action;
  if (
    typeof action === 'string' &&
    /\b(delete|remove|discard|trash)\b/i.test(action)
  ) {
    return true;
  }

  return /\b(delete|remove|discard|trash)\b[\s\S]{0,40}\bdraft\b|\bcancel (the )?draft\b/i.test(
    message,
  );
}

export function extractEmail(value: string): string | null {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}
