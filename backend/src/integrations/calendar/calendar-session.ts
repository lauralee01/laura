import { BadRequestException } from '@nestjs/common';

/** Ensures a non-empty trimmed session id for calendar tools (bound to OAuth tokens). */
export function requireCalendarSessionId(
  sessionId: string | undefined,
  message: string,
): string {
  const sid = sessionId?.trim();
  if (!sid) {
    throw new BadRequestException(message);
  }
  return sid;
}
