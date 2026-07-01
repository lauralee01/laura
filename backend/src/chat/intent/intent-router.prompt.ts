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
- general_chat: greetings, questions, small talk, general advice, planning help, routines, task planning, weekly planning, daily planning, or anything that is not an explicit calendar/email tool action.
  Examples: "help me plan my week", "organize my day", "make a study schedule", "suggest things to do tomorrow".
- calendar_list: user explicitly wants to see, list, show, check, review, or summarize calendar events already on their calendar.
  Examples: "What's on my calendar today?", "Show my events this week", "Do I have meetings tomorrow?"
  Do not use calendar_list for broad planning requests like "help me plan my week", "organize my day", or "make me a weekly routine" unless the user explicitly asks to use/check their calendar.
- calendar_create: user explicitly wants to create, add, book, schedule, remind, block time, or put a specific event/reminder on their calendar.
  Examples: "Add dentist appointment tomorrow at 3pm", "Schedule a meeting with Sarah Friday", "Put gym on my calendar at 6", "Block 5 to 7 tomorrow for job applications."
  Use this intent when the user agrees to a previous assistant suggestion to add/block/schedule something, if pendingHint indicates a calendar create action is waiting.
  Do not use calendar_create for general planning, routines, study schedules, or suggested plans unless the user explicitly asks to add/block/schedule it on their calendar.
- calendar_update: user explicitly wants to move/reschedule/change/edit an existing calendar event.
- calendar_delete: user explicitly wants to cancel/delete/remove an existing calendar event.
- current_datetime: user asks for the current time, today's date, current date, current day, or what time/date it is now.
  Examples: "What time is it?", "What is the time currently?", "What's today's date?", "What day is it today?", "What date is today?"
  Always use this intent for current date/time questions. Do not classify these as general_chat.
- Only route to calendar_* intents when the user is asking about their actual calendar, events, meetings, appointments, or wants something placed on the calendar.
- Do not route general life planning, productivity advice, weekly plans, routines, or to-do suggestions to calendar_* unless the user explicitly mentions their calendar or asks Laura to add/check events.
- If the message is a short answer to the assistant’s previous follow-up question, classify it as general_chat unless pendingHint clearly indicates a tool action is waiting.

Optional slots hints (execution still validates in code): e.g. titleHint, roughTimeHint strings for create; titleHint for update/delete.
- email_draft: user wants Laura to write, draft, compose, or prepare an email. If the user says "send an email" but there is no pending approved draft, classify as email_draft first because the app should draft before sending.
- email_send_confirm: user is confirming sending a pending email (e.g. yes, send, go ahead). Use only when pendingHint indicates a draft is waiting for send.
- email_draft_revise: user wants to change wording of a pending draft before sending.
- pending_confirm: user confirms a pending action (e.g. yes/confirm) that is not email-send-specific.
- pending_cancel: user is cancelling/dismissing the current pending action (e.g. cancel, never mind). Use when pendingHint describes what to cancel.
- set_timezone: user is providing or setting a timezone, usually after the assistant asked for one or pendingHint indicates timezone is needed.
  Examples: "America/Chicago", "Use Central time", "Set my timezone to America/New_York".
- clarify: use only when the message is ambiguous on its own and there is no pending context or previous assistant question that explains it.

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
calendar_create — use consistent camelCase slots:
- Use titleHint for the event title.
- Use startTime and endTime for specific start/end times.
- Use roughTimeHint if the user gives vague timing like "tomorrow morning" or "after lunch".
- Use dayOffset when the user says today/tomorrow/yesterday.
- Never use snake_case keys like start_time or end_time.
- Never use "title"; use "titleHint" instead.
- If pendingHint indicates a calendar event is waiting for missing details, extract only the new detail from the user's reply and keep intent as calendar_create.
  Examples:
  - pendingHint: "Need time for calendar event: Job applications"; user: "July 2 17:00 to 19:00"
    → slots: { "startTime": "July 2 17:00", "endTime": "July 2 19:00" }
  - pendingHint: "Need title for calendar event from July 2 17:00 to 19:00"; user: "Use Job applications"
    → slots: { "titleHint": "Job applications" }

Other tool slots:
- set_timezone: slots.timeZone as IANA (e.g. "America/Chicago").
- Pending pick prompts: slots.selectedIndex as 1-based number.
- pending_confirm: confirm-style replies for non-email pending actions.
- calendar_create: slots must use camelCase only: titleHint, startTime, endTime, roughTimeHint, dayOffset.

Intent classification prompt version: ${INTENT_CLASSIFICATION_PROMPT_VERSION}
`.trim();
}
