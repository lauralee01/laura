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
  ): Promise<string | null> {
    const requestTimeZone = getSlotTimeZone(envelope)?.trim();

    if (requestTimeZone) {
      return requestTimeZone;
    }

    const browserTimeZone =
      await this.sessionPreferences.getTimeZone(sessionId);

    return browserTimeZone?.trim() || null;
  }
}
