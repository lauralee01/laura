import { DateTime } from 'luxon';
import type { LlmService } from '../../llm/llm.service';
import { safeParseJsonObject } from './tool-orchestrator.utils';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function cleanString(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return undefined;
}

function cleanNullableString(val: unknown): string | null {
  return cleanString(val) ?? null;
}

function cleanNumber(val: unknown): number | null {
  return typeof val === 'number' && !Number.isNaN(val) ? val : null;
}

export async function extractDraftEmailArgs(
  llm: LlmService,
  message: string,
): Promise<{
  recipients: string[];
  subject?: string;
  tone?: string;
  context: string;
} | null> {
  if (!message?.trim()) return null;

  // FAST PATH: If message contains no email address, this extractor will always return null
  // because valid recipients are required. Skip the expensive LLM network roundtrip.
  if (!EMAIL_REGEX.test(message)) {
    return null;
  }

  const systemPrompt =
    'Extract email draft arguments from user message. Return JSON only:\n' +
    '{\n' +
    '  "recipients": string[],\n' +
    '  "subject": string | null,\n' +
    '  "tone": string | null,\n' +
    '  "context": string\n' +
    '}\n' +
    'Rules:\n' +
    '- recipients: real email addresses in message only. If none, return [].\n' +
    '- context: what to say in plain language. Describe the ask directly.\n' +
    '- subject: optional short subject if implied, else null.';

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const recipientsUnknown = parsed['recipients'];
  const contextUnknown = parsed['context'];

  if (
    !Array.isArray(recipientsUnknown) ||
    typeof contextUnknown !== 'string' ||
    !contextUnknown.trim()
  ) {
    return null;
  }

  const recipients = recipientsUnknown.filter(
    (v): v is string => typeof v === 'string' && EMAIL_REGEX.test(v.trim()),
  );
  if (recipients.length === 0) return null;

  return {
    recipients,
    subject: cleanString(parsed['subject']),
    tone: cleanString(parsed['tone']),
    context: contextUnknown.trim(),
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
  if (!message?.trim()) return null;

  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const systemPrompt =
    `Extract calendar event arguments. Return JSON only:\n` +
    `{\n` +
    `  "title": string,\n` +
    `  "start": string | null,\n` +
    `  "end": string | null,\n` +
    `  "description": string | null,\n` +
    `  "reminderMinutesBefore": number | null\n` +
    `}\n` +
    `Rules:\n` +
    `- Today in ${timeZone} is ${todayInZone}.\n` +
    `- Month+day without year: pick NEXT occurrence on/after ${todayInZone}.\n` +
    `- start/end: ISO datetime strings in LOCAL time for ${timeZone} (format: YYYY-MM-DDTHH:mm:ss, NO 'Z' or offset).\n` +
    `- If no end time given, end = start + 1 hour.\n` +
    `- If start undetermined, set start & end to null.`;

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const title = cleanString(parsed['title']);
  const start = cleanString(parsed['start']);
  const end = cleanString(parsed['end']);

  if (!title || !start || !end) {
    return null;
  }

  const description = cleanString(parsed['description']);
  const reminder = cleanNumber(parsed['reminderMinutesBefore']);

  return {
    title,
    start,
    end,
    description,
    reminderMinutesBefore: reminder !== null ? reminder : undefined,
  };
}

export type CalendarMutationExtraction = {
  operation: 'delete' | 'update';
  titleKeywords: string;
  dayOffset: number | null;
  weekOffset: number | null;
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
  if (!message?.trim()) return null;

  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const systemPrompt =
    `Extract calendar DELETE or UPDATE intent. Return JSON only:\n` +
    `{\n` +
    `  "operation": "delete" | "update",\n` +
    `  "titleKeywords": string,\n` +
    `  "dayOffset": number | null,\n` +
    `  "weekOffset": number | null,\n` +
    `  "searchWholeWeek": boolean,\n` +
    `  "searchNextDays": number | null,\n` +
    `  "newTitle": string | null,\n` +
    `  "newStart": string | null,\n` +
    `  "newEnd": string | null\n` +
    `}\n` +
    `Rules:\n` +
    `- Today in ${timeZone} is ${todayInZone}.\n` +
    `- titleKeywords: substring clues for event title (e.g. "dentist"). Use "any" if none given.\n` +
    `- dayOffset: 0=today, 1=tomorrow, -1=yesterday, null if unclear.\n` +
    `- weekOffset: 0=this week, 1=next week, null if unclear.\n` +
    `- searchWholeWeek: true for "this week" / "the week" without a specific day.\n` +
    `- searchNextDays: days ahead to search when vague (default 14).\n` +
    `- delete: set newTitle, newStart, newEnd to null.\n` +
    `- update: set newTitle/newStart/newEnd as LOCAL ISO (YYYY-MM-DDTHH:mm:ss, no Z).`;

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const operation = parsed['operation'];
  const titleKeywords = cleanString(parsed['titleKeywords']);

  if ((operation !== 'delete' && operation !== 'update') || !titleKeywords) {
    return null;
  }

  const dayOffset = cleanNumber(parsed['dayOffset']);
  const weekOffset = cleanNumber(parsed['weekOffset']);
  const searchWholeWeek = parsed['searchWholeWeek'] === true;
  const searchNextDays = cleanNumber(parsed['searchNextDays']);

  return {
    operation,
    titleKeywords,
    dayOffset,
    weekOffset,
    searchWholeWeek,
    searchNextDays,
    newTitle: cleanNullableString(parsed['newTitle']),
    newStart: cleanNullableString(parsed['newStart']),
    newEnd: cleanNullableString(parsed['newEnd']),
  };
}
