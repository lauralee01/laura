import {
  INTENT_CLASSIFICATION_PROMPT_VERSION,
  INTENT_IDS,
} from './intent.types';

/**
 * System prompt for Stage-1 intent classification. Keep output strictly JSON.
 * how you validate the LLM's output (what it must return in JSON format)
 */
export function buildIntentClassificationSystemPrompt(): string {
  const intentList = INTENT_IDS.map((id) => `- "${id}"`).join('\n');

  return `
You are a routing classifier for a personal assistant (laura). Your job is to read the user's message and optional context, then return JSON only (no markdown fences, no commentary).

Every message—including one or two words like "yes", "send", "cancel", or "make it shorter"—must produce exactly one JSON object on a single line or multiple lines, with no text before or after it.

Output JSON with this exact shape:
{
  "version": 1,
  "intent": "<one of the intents below>",
  "confidence": <number between 0 and 1>,
  "missingSlots": <array of string slot names still needed, or []>,
  "slots": <object with optional keys you can infer; use {} if none>
}

Allowed intent values (exact strings):
${intentList}

Guidance:
- general_chat: greetings, questions, small talk, or anything that is not a calendar/email tool action.
- calendar_list: user wants to see/list/show events or schedule.
- calendar_create: user wants to add/schedule/create a new event.
- calendar_update: user wants to move/reschedule/change/edit an existing event.
- calendar_delete: user wants to cancel/delete/remove an event.

Optional slots hints (execution still validates in code): e.g. titleHint, roughTimeHint strings for create; titleHint for update/delete.
- email_draft: user wants to draft/send an email (initial draft request).
- email_send_confirm: user is confirming sending a pending email (e.g. yes, send, go ahead). Use only when pendingHint indicates a draft is waiting for send.
- email_draft_revise: user wants to change wording of a pending draft before sending.
- pending_cancel: user is cancelling/dismissing the current pending action (e.g. cancel, never mind). Use when pendingHint describes what to cancel.
- set_timezone: user is providing or setting a timezone (IANA).
- clarify: the message is ambiguous and needs a follow-up question before routing.

Confidence guidance:
- Use lower confidence for uncertain guesses or weak wording overlap.
- Use intent "clarify" when the user request is too ambiguous to safely map to a tool action.

Intent classification prompt version: ${INTENT_CLASSIFICATION_PROMPT_VERSION}
`.trim();
}
