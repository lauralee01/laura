import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { IANAZone } from 'luxon';

@Injectable()
export class SessionPreferencesService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing. Set it in backend/.env');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  async getTimeZone(sessionId: string): Promise<string | null> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return null;

    const res = await this.pool.query<{ timezone: string | null }>(
      `
      SELECT timezone
      FROM session_preferences
      WHERE session_id = $1
      LIMIT 1;
      `,
      [sid],
    );

    return res.rows[0]?.timezone ?? null;
  }

  async setTimeZone(sessionId: string, timeZone: string): Promise<void> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return;

    const tz = (timeZone ?? '').trim();
    if (!tz) {
      throw new BadRequestException('timeZone must not be empty');
    }

    // Validate to ensure later Luxon conversions won’t fail.
    // Luxon treats IANA names and (usually) "UTC" as valid zones.
    if (!IANAZone.isValidZone(tz)) {
      throw new BadRequestException(
        `Invalid timezone. Please use an IANA timezone like America/Chicago.`,
      );
    }

    await this.pool.query(
      `
      INSERT INTO session_preferences (session_id, timezone)
      VALUES ($1, $2)
      ON CONFLICT (session_id)
      DO UPDATE SET timezone = EXCLUDED.timezone, updated_at = now();
      `,
      [sid, tz],
    );
  }
}

