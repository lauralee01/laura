import { Injectable } from '@nestjs/common';
import { SessionPreferencesService } from '../../session-preferences.service';
import { getSlotTimeZone } from '../tool-orchestrator.intent-slots';
import type { IntentEnvelope } from '../../intent/intent.types';

/** Shown when calendar work needs a timezone before it can continue. */
export const CALENDAR_TIMEZONE_PROMPT =
  'I need your timezone before I can use your calendar. ' +
  'Reply with an IANA timezone like America/Chicago, Europe/London, or Africa/Lagos.';

@Injectable()
export class CalendarTimezoneService {
  constructor(private readonly sessionPreferences: SessionPreferencesService) { }

  /**
   * Resolves timezone from the intent slot first, then session prefs.
   * Returns null when neither is available so callers can set pending
   * and ask the user (instead of hard-failing).
   */
  async resolveTimeZone(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    const requestTimeZone = getSlotTimeZone(envelope)?.trim();

    if (requestTimeZone) {
      return requestTimeZone;
    }

    const storedTimeZone =
      await this.sessionPreferences.getTimeZone(sessionId);

    if (!storedTimeZone?.trim()) {
      return null;
    }

    return storedTimeZone.trim();
  }
}
