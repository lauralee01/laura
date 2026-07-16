import { Injectable } from '@nestjs/common';
import { SessionPreferencesService } from '../../session-preferences.service';
import { getSlotTimeZone } from '../tool-orchestrator.intent-slots';
import type { IntentEnvelope } from '../../intent/intent.types';

@Injectable()
export class CalendarTimezoneService {
  constructor(private readonly sessionPreferences: SessionPreferencesService) { }

  async resolveTimeZone(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const requestTimeZone = getSlotTimeZone(envelope)?.trim();

    if (requestTimeZone) {
      return requestTimeZone;
    }

    const storedTimeZone =
      await this.sessionPreferences.getTimeZone(sessionId);

    if (!storedTimeZone?.trim()) {
      throw new Error('No timezone is available for the current session.');
    }

    return storedTimeZone.trim();
  }
}
