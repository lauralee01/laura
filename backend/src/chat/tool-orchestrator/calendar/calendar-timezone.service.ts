import { Injectable } from '@nestjs/common';
import { SessionPreferencesService } from '../../session-preferences.service';
import { getSlotTimeZone } from '../tool-orchestrator.intent-slots';
import type { IntentEnvelope } from '../../intent/intent.types';

@Injectable()
export class CalendarTimezoneService {
  constructor(private readonly sessionPreferences: SessionPreferencesService) {}

  async resolveTimeZone(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    const tzCandidate = getSlotTimeZone(envelope);

    if (tzCandidate?.trim()) {
      const timeZone = tzCandidate.trim();

      await this.sessionPreferences
        .setTimeZone(sessionId, timeZone)
        .catch(() => undefined);

      return timeZone;
    }

    const storedTz = await this.sessionPreferences.getTimeZone(sessionId);

    return storedTz?.trim() || null;
  }

  formatTimezoneQuestion(): string {
    return (
      'Before I continue, what timezone should I use for your calendar?\n\n' +
      'You can reply with something like:\n' +
      '• Central\n' +
      '• Eastern\n' +
      '• Pacific\n' +
      '• America/Chicago\n\n' +
      'If you’re not sure, just tell me your city or state.'
    );
  }
}
