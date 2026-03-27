import { BadRequestException } from '@nestjs/common';

export function formatToolFailureMessage(action: string, err: unknown): string {
  if (err instanceof BadRequestException) {
    return `I couldn’t ${action}. ${err.message}`;
  }
  if (err instanceof Error) {
    return `I couldn’t ${action}. ${err.message}`;
  }
  return `I couldn’t ${action}. Please try again.`;
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
