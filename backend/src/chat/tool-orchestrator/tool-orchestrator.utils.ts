import { BadRequestException } from '@nestjs/common';

/** Strips trailing punctuation / chat markdown so "Yes." and "yes" match alike. */
export function normalizeQuickReply(message: string): string {
  let t = message.trim().toLowerCase();
  t = t.replace(/^\*+|\*+$/g, '').trim();
  t = t.replace(/[.!?…]+$/u, '').trim();
  return t;
}

/**
 * Maps thrown errors to short, user-safe text (no raw API JSON, quota URLs, or stack traces).
 */
export function userFacingErrorDetail(err: unknown): string {
  const raw =
    err instanceof BadRequestException || err instanceof Error
      ? err.message
      : String(err);
  const lower = raw.toLowerCase();

  if (
    raw.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('too many requests')
  ) {
    return (
      'The AI service is temporarily busy or hit a usage limit. ' +
      'Please wait a minute and try again.'
    );
  }

  if (lower.includes('gemini api error')) {
    if (/\b401\b|\b403\b/.test(raw)) {
      return (
        'There was a problem authenticating with the AI service. ' +
        'Check API key configuration if you are the app owner.'
      );
    }
    if (/\b5\d\d\b/.test(raw)) {
      return 'The AI service had a temporary problem. Please try again in a moment.';
    }
    return 'The AI service returned an error. Please try again in a moment.';
  }

  if (lower.includes('no llm api key')) {
    return 'The assistant is not configured with an LLM API key.';
  }

  if (
    raw.length > 400 ||
    (raw.includes('{') && raw.includes('"message"') && raw.includes('Details:'))
  ) {
    return 'Something went wrong. Please try again.';
  }

  return raw;
}

export function formatToolFailureMessage(action: string, err: unknown): string {
  const detail = userFacingErrorDetail(err);
  return `I couldn’t ${action}. ${detail}`;
}

export function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const jsonUnknown: unknown = JSON.parse(raw);
    if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
    return jsonUnknown as Record<string, unknown>;
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
      return null;
    try {
      const slice = raw.slice(firstBrace, lastBrace + 1);
      const jsonUnknown: unknown = JSON.parse(slice);
      if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
      return jsonUnknown as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
