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

export type DraftEmailExtraction = {
  recipients: string[];
  /** Display name when the user named a person but not an address. */
  recipientName?: string;
  subject?: string;
  tone?: string;
  context?: string;
};

export async function extractDraftEmailArgs(
  llm: LlmService,
  message: string,
): Promise<DraftEmailExtraction | null> {
  if (!message?.trim()) return null;

  const systemPrompt =
    'Extract email draft arguments from user message. Return JSON only:\n' +
    '{\n' +
    '  "recipients": string[],\n' +
    '  "recipientName": string | null,\n' +
    '  "subject": string | null,\n' +
    '  "tone": string | null,\n' +
    '  "context": string | null\n' +
    '}\n' +
    'Rules:\n' +
    '- recipients: real email addresses (must contain @) found in the message. If none, [].\n' +
    '- recipientName: person/org name when the user names a recipient without an address (e.g. "Jane"). Else null.\n' +
    '- context: what to say in plain language. Describe the ask directly. null if unclear.\n' +
    '- subject: optional short subject if implied, else null.\n' +
    '- Do not invent email addresses.';

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
    errorMode: 'throw',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const recipientsUnknown = parsed['recipients'];
  const recipients = Array.isArray(recipientsUnknown)
    ? recipientsUnknown.filter(
        (v): v is string =>
          typeof v === 'string' && EMAIL_REGEX.test(v.trim()),
      )
    : [];

  const context = cleanString(parsed['context']);
  const recipientName = cleanString(parsed['recipientName']);
  const subject = cleanString(parsed['subject']);
  const tone = cleanString(parsed['tone']);

  if (
    recipients.length === 0 &&
    !recipientName &&
    !context &&
    !subject
  ) {
    return null;
  }

  return {
    recipients,
    recipientName,
    subject,
    tone,
    context,
  };
}

export type CalendarEventArgs = {
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
};

/** Partial create args already known from Stage-1 intent slots. */
export type CalendarEventSlotHints = {
  title?: string;
  start?: string;
  end?: string;
  description?: string;
};

export async function extractCalendarEventArgs(
  llm: LlmService,
  message: string,
  timeZone: string,
  slotHints?: CalendarEventSlotHints,
): Promise<CalendarEventArgs | null> {
  if (!message?.trim()) return null;

  const hintTitle = slotHints?.title?.trim();
  const hintStart = slotHints?.start?.trim();
  const hintEnd = slotHints?.end?.trim();

  /*
   * Slot-first: when Stage-1 already filled title + times, skip the second LLM.
   */
  if (hintTitle && hintStart && hintEnd) {
    return {
      title: hintTitle,
      start: hintStart,
      end: hintEnd,
      description: slotHints?.description?.trim() || undefined,
    };
  }

  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const knownBits: string[] = [];
  if (hintTitle) knownBits.push(`Known title: ${hintTitle}`);
  if (hintStart) knownBits.push(`Known start: ${hintStart}`);
  if (hintEnd) knownBits.push(`Known end: ${hintEnd}`);

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
    `- If start undetermined, set start & end to null.` +
    (knownBits.length
      ? `\n- Prefer these Stage-1 hints when filling gaps:\n  ${knownBits.join('\n  ')}`
      : '');

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
    errorMode: 'throw',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const title = hintTitle || cleanString(parsed['title']);
  const start = hintStart || cleanString(parsed['start']);
  const end = hintEnd || cleanString(parsed['end']);

  if (!title || !start || !end) {
    return null;
  }

  const description =
    slotHints?.description?.trim() || cleanString(parsed['description']);
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
  preferredOperation?: 'delete' | 'update',
): Promise<CalendarMutationExtraction | null> {
  if (!message?.trim()) return null;

  const todayInZone = DateTime.now().setZone(timeZone).toISODate();

  const lockedOperationNote = preferredOperation
    ? `\n- The Stage-1 intent already chose operation="${preferredOperation}". Still return that operation; do not flip delete↔update.`
    : '';

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
    `- update: set newTitle/newStart/newEnd as LOCAL ISO (YYYY-MM-DDTHH:mm:ss, no Z).` +
    lockedOperationNote;

  const raw = await llm.generate({
    systemPrompt,
    userMessage: message,
    temperature: 0.1,
    maxOutputTokens: 350,
    responseMimeType: 'application/json',
    errorMode: 'throw',
  });

  const parsed = safeParseJsonObject(raw);
  if (!parsed) return null;

  const parsedOperation = parsed['operation'];
  const operation =
    preferredOperation ??
    (parsedOperation === 'delete' || parsedOperation === 'update'
      ? parsedOperation
      : null);
  const titleKeywords = cleanString(parsed['titleKeywords']);

  if (!operation || !titleKeywords) {
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
    newTitle:
      operation === 'delete'
        ? null
        : cleanNullableString(parsed['newTitle']),
    newStart:
      operation === 'delete'
        ? null
        : cleanNullableString(parsed['newStart']),
    newEnd:
      operation === 'delete'
        ? null
        : cleanNullableString(parsed['newEnd']),
  };
}
