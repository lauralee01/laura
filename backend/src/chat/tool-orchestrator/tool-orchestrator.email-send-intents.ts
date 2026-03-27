import {
  isCalendarCreateIntent,
  isCalendarListIntent,
  isEmailDraftIntent,
} from './tool-orchestrator.calendar-intents';

/** User explicitly cancels sending the pending draft. */
export function isCancelPendingEmailSend(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (t.length > 120) return false;
  return (
    t === 'cancel' ||
    t === 'cancel.' ||
    t.startsWith('cancel ') ||
    t.includes("don't send") ||
    t.includes('do not send') ||
    t === 'never mind' ||
    t === 'nevermind' ||
    t === 'stop' ||
    t === 'abort' ||
    t === 'no' ||
    t === 'nope'
  );
}

/**
 * User confirms sending (short, affirmative commands).
 * Avoid matching “draft another email” (requires draft + email for that path).
 */
export function isConfirmSendEmail(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (t.length > 120) return false;
  if (isCancelPendingEmailSend(message)) return false;

  if (
    t === 'y' ||
    t === 'yes' ||
    t === 'send' ||
    t === 'send!' ||
    t === 'send it' ||
    t === 'send now' ||
    t === 'send it now' ||
    t === 'go ahead' ||
    t === 'confirm' ||
    t === 'please send' ||
    t === 'pls send' ||
    t === 'ok send' ||
    t === 'okay send' ||
    t === 'ok' ||
    t === 'okay'
  ) {
    return true;
  }
  if (/^yes,?\s*send\.?$/.test(t)) return true;

  if (/\bdraft\b/.test(t) && /\bemail\b/.test(t)) return false;

  if (
    t === 'send that email' ||
    t === 'send the email' ||
    t.includes('send it now') ||
    (t.includes('send it') && !t.includes('draft'))
  ) {
    return true;
  }

  return false;
}

/** New tool request should drop the “ready to send?” prompt and run the new intent. */
export function shouldClearEmailSendForNewToolIntent(message: string): boolean {
  return (
    isCalendarListIntent(message) ||
    isCalendarCreateIntent(message) ||
    isEmailDraftIntent(message)
  );
}

/**
 * User wants to change the pending draft’s wording (before send).
 * Must stay disjoint from confirm/cancel/clear-for-new-tool paths.
 */
export function isEmailDraftRevisionIntent(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (t.length > 1200) return false;
  if (isCancelPendingEmailSend(message)) return false;
  if (isConfirmSendEmail(message)) return false;
  if (shouldClearEmailSendForNewToolIntent(message)) return false;

  const keywords = [
    'rewrite',
    'revise',
    'rephrase',
    'change the subject',
    'change subject',
    'new subject',
    'different subject',
    'make it',
    'make the',
    'shorter',
    'longer',
    'more formal',
    'less formal',
    'casual',
    'friendlier',
    'softer',
    'tone',
    'instead',
    'update the email',
    'update the draft',
    'edit the email',
    'edit the draft',
    'fix the',
    'sound more',
    'sound less',
    'opening',
    'closing',
    'paragraph',
    'emphasize',
    'mention',
    'don’t mention',
    "don't mention",
    'warmer',
    'colder',
    'rather than',
    'instead of',
  ];
  if (keywords.some((k) => t.includes(k))) return true;

  const trimmed = t.replace(/^please\s+/, '').replace(/^could you\s+/, '').replace(/^can you\s+/, '');
  if (
    trimmed.length <= 280 &&
    /^(make|change|fix|shorten|lengthen|add|remove|cut|tweak)\b/.test(trimmed)
  ) {
    return true;
  }

  return false;
}
