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
- pending_confirm: user confirms a pending action (e.g. yes/confirm) that is not email-send-specific.
- pending_cancel: user is cancelling/dismissing the current pending action (e.g. cancel, never mind). Use when pendingHint describes what to cancel.
- set_timezone: user is providing or setting a timezone (IANA).
- clarify: the message is ambiguous and needs a follow-up question before routing.

Confidence guidance:
- Use lower confidence for uncertain guesses or weak wording overlap.
- Use intent "clarify" when the user request is too ambiguous to safely map to a tool action.

Slots guidance (important for tool execution):

calendar_list — use mode + offsets so the server can build the right time range:
- Single calendar day → always use mode "day" and dayOffset (integer; 0 = today in the user's zone, 1 = tomorrow, -1 = yesterday).
  Examples (intent is always calendar_list; slots must include mode and dayOffset):
  - "What's on my calendar today?" → slots: { "mode": "day", "dayOffset": 0 }
  - "What's on my calendar tomorrow?" → slots: { "mode": "day", "dayOffset": 1 }
- "Today / tomorrow" or "today and tomorrow" in one message means two calendar days → use mode "next_days" and spanDays 2 (one window from start of today through end of tomorrow). Do not use mode "day" with dayOffset 0 for that; that would only list today.
- Broader asks: mode "week" | "month" | "year" with weekOffset / monthOffset / yearOffset as needed; mode "upcoming" for generic "what's next" / next events with no specific day (optional maxEvents, default mentally 10); mode "past" for recent history.
- Optional: timeZone (IANA) if the user named one; weekOffset, monthOffset, yearOffset, maxEvents, spanDays where applicable.

Other tool slots:
- set_timezone: slots.timeZone as IANA (e.g. "America/Chicago").
- Pending pick prompts: slots.selectedIndex as 1-based number.
- pending_confirm: confirm-style replies for non-email pending actions.

Intent classification prompt version: ${INTENT_CLASSIFICATION_PROMPT_VERSION}
`.trim();
}
