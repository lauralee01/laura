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

  async getLocation(sessionId: string): Promise<string | null> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return null;

    const res = await this.pool.query<{ location: string | null }>(
      `
    SELECT location
    FROM session_preferences
    WHERE session_id = $1
    LIMIT 1;
    `,
      [sid],
    );

    return res.rows[0]?.location ?? null;
  }

  async setLocation(sessionId: string, location: string): Promise<void> {
    const sid = sessionId.trim();
    const loc = location.trim();

    if (!sid || !loc) return;

    await this.pool.query(
      `
    INSERT INTO session_preferences (session_id, location, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (session_id)
    DO UPDATE SET
      location = EXCLUDED.location,
      updated_at = NOW();
    `,
      [sid, loc],
    );
  }

  async setPendingAction(sessionId: string, pendingAction: unknown): Promise<void> {
    await this.pool.query(
      `
    INSERT INTO session_preferences (session_id, pending_action, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (session_id)
    DO UPDATE SET
        pending_action = EXCLUDED.pending_action,
        updated_at = NOW();
    `,
      [sessionId, JSON.stringify(pendingAction)],
    );
  }

  async getPendingAction(sessionId: string): Promise<any | null> {
    const res = await this.pool.query<{ pending_action: any | null }>(
      `
    SELECT pending_action
    FROM session_preferences
    WHERE session_id = $1
    LIMIT 1;
    `,
      [sessionId],
    );

    return res.rows[0]?.pending_action ?? null;
  }

  async clearPendingAction(sessionId: string): Promise<void> {
    await this.pool.query(
      `
    UPDATE session_preferences
    SET pending_action = NULL,
        updated_at = NOW()
    WHERE session_id = $1;
    `,
      [sessionId],
    );
  }
}


