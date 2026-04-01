import { DateTime } from 'luxon';
import type { LlmService } from '../../llm/llm.service';
import { safeParseJsonObject } from './tool-orchestrator.utils';

export async function extractDraftEmailArgs(
  llm: LlmService,
  message: string,
): Promise<{
  recipients: string[];
  subject?: string;
  tone?: string;
  context: string;
} | null> {
  const prompt = `
Extract email draft arguments from the user message.
Return JSON only with this exact schema:
{
  "recipients": string[],
  "subject": string | null,
  "tone": string | null,
  "context": string
}

Rules:
- recipients must include only real email addresses found in the message.
- if no email address is present, return recipients: [].
- context: what to say in plain language (as if instructing a writer). Do not use the phrase "the recipient"; name people or describe the ask directly.
- subject: optional short subject if the user implied one; otherwise null.
`.trim();

  const raw = await llm.generate({
    systemPrompt: prompt,
    userMessage: message,
  });
  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const recipientsUnknown = parsed['recipients'];
  const contextUnknown = parsed['context'];
  if (!Array.isArray(recipientsUnknown) || typeof contextUnknown !== 'string')
    return null;

  const recipients = recipientsUnknown.filter(
    (v): v is string => typeof v === 'string',
  );
  if (recipients.length === 0) return null;

  const subjectUnknown = parsed['subject'];
  const toneUnknown = parsed['tone'];

  return {
    recipients,
    subject: typeof subjectUnknown === 'string' ? subjectUnknown : undefined,
    tone: typeof toneUnknown === 'string' ? toneUnknown : undefined,
    context: contextUnknown,
  };
}

export async function extractCalendarEventArgs(
  llm: LlmService,
  message: string,
  timeZone: string,
): Promise<{
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
} | null> {
  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const prompt = `
Extract calendar event arguments from the user message.
Return JSON only with this exact schema:
{
  "title": string,
  "start": string | null,
  "end": string | null,
  "description": string | null,
  "reminderMinutesBefore": number | null
}

Rules:
- Today's date in ${timeZone} is ${todayInZone}.
- If the user provides a month+day (like "March 26") without a year, choose the NEXT occurrence of that date on/after today's date (${todayInZone}).
- start and end must be ISO datetime strings representing LOCAL time in ${timeZone}.
- Use this exact format: YYYY-MM-DDTHH:mm:ss (NO trailing 'Z' and NO timezone offset like '+01:00').
- If the user provides a start time but does not provide an end time, set end = start + 1 hour.
- If start cannot be determined, return null for both start and end.
- title should be short and clear.
`.trim();

  const raw = await llm.generate({
    systemPrompt: prompt,
    userMessage: message,
  });
  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const title = parsed['title'];
  const start = parsed['start'];
  const end = parsed['end'];
  const description = parsed['description'];
  const reminder = parsed['reminderMinutesBefore'];

  if (
    typeof title !== 'string' ||
    typeof start !== 'string' ||
    typeof end !== 'string'
  ) {
    return null;
  }

  return {
    title,
    start,
    end,
    description: typeof description === 'string' ? description : undefined,
    reminderMinutesBefore:
      typeof reminder === 'number' ? reminder : undefined,
  };
}

export type CalendarMutationExtraction = {
  operation: 'delete' | 'update';
  titleKeywords: string;
  dayOffset: number | null;
  searchWholeWeek: boolean;
  searchNextDays: number | null;
  newTitle: string | null;
  newStart: string | null;
  newEnd: string | null;
};

export async function extractCalendarMutationArgs(
  llm: LlmService,
  message: string,
  timeZone: string,
): Promise<CalendarMutationExtraction | null> {
  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const prompt = `
Extract calendar DELETE or UPDATE intent from the user message.
Return JSON only with this exact schema:
{
  "operation": "delete" | "update",
  "titleKeywords": string,
  "dayOffset": number | null,
  "searchWholeWeek": boolean,
  "searchNextDays": number | null,
  "newTitle": string | null,
  "newStart": string | null,
  "newEnd": string | null
}

Rules:
- Today's date in ${timeZone} is ${todayInZone}.
- titleKeywords: substring clues for the event title (e.g. "dentist", "1:1 mara"). If the user gave no title clue, use "any".
- dayOffset: 0 = today, 1 = tomorrow, -1 = yesterday, null if unclear.
- searchWholeWeek: true for "this week" / "the week" without a specific day.
- searchNextDays: days ahead to search when day is vague (use 14 if unsure); null ok — caller defaults to 14.
- delete: set newTitle, newStart, newEnd to null.
- update: set newTitle if renaming; newStart and newEnd as LOCAL ISO datetimes (YYYY-MM-DDTHH:mm:ss, no Z) for ${timeZone} when rescheduling. If only a new start time is implied, set newEnd one hour after newStart.
- update: if the user only says a new time without a date (e.g. "move it to 4pm", "to 5:30"), infer the calendar date as best you can; the server may still adjust the date to match the event being edited.
`.trim();

  const raw = await llm.generate({
    systemPrompt: prompt,
    userMessage: message,
  });
  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const operation = parsed['operation'];
  const titleKeywords = parsed['titleKeywords'];
  if (operation !== 'delete' && operation !== 'update') return null;
  if (typeof titleKeywords !== 'string') return null;

  const dayOffsetUnknown = parsed['dayOffset'];
  const dayOffset =
    dayOffsetUnknown === null || dayOffsetUnknown === undefined
      ? null
      : typeof dayOffsetUnknown === 'number'
        ? dayOffsetUnknown
        : null;

  const searchWholeWeek = parsed['searchWholeWeek'] === true;
  const searchNextDaysUnknown = parsed['searchNextDays'];
  const searchNextDays =
    typeof searchNextDaysUnknown === 'number'
      ? searchNextDaysUnknown
      : null;

  const newTitle = parsed['newTitle'];
  const newStart = parsed['newStart'];
  const newEnd = parsed['newEnd'];

  return {
    operation,
    titleKeywords,
    dayOffset,
    searchWholeWeek,
    searchNextDays,
    newTitle: typeof newTitle === 'string' ? newTitle : null,
    newStart: typeof newStart === 'string' ? newStart : null,
    newEnd: typeof newEnd === 'string' ? newEnd : null,
  };
}
