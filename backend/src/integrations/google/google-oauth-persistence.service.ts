import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import type { GoogleCredentials, GoogleTokenResponse } from './google-oauth.types';

/**
 * PostgreSQL access for OAuth CSRF state rows and stored Google tokens.
 * Owns the connection pool so lifecycle (end on shutdown) stays in one place.
 */
@Injectable()
export class GoogleOAuthPersistenceService implements OnModuleDestroy {
  private readonly logger = new Logger(GoogleOAuthPersistenceService.name);
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

  /**
   * Returns stored Google tokens for a browser session, or null if never connected.
   */
  async loadCredentials(sessionId: string): Promise<GoogleCredentials | null> {
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }
    const res = await this.pool.query<{
      access_token: string;
      refresh_token: string | null;
      token_type: string;
      scope: string | null;
      expires_at: Date | null;
    }>(
      `
      SELECT access_token, refresh_token, token_type, scope, expires_at
      FROM google_oauth_tokens
      WHERE session_id = $1
      `,
      [sid],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      tokenType: row.token_type,
      scope: row.scope,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Upsert tokens for a session. Preserves existing refresh_token if Google omits it on refresh.
   */
  async upsertTokens(
    sessionId: string,
    tokens: GoogleTokenResponse,
  ): Promise<void> {
    const expiresAt =
      tokens.expires_in !== undefined
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
        : null;

    await this.pool.query(
      `
      INSERT INTO google_oauth_tokens (
        session_id, access_token, refresh_token, token_type, scope, expires_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (session_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
      `,
      [
        sessionId,
        tokens.access_token,
        tokens.refresh_token ?? null,
        tokens.token_type || 'Bearer',
        tokens.scope ?? null,
        expiresAt,
      ],
    );

    this.logger.log(
      `[OAuth] tokens persisted accessExpiresAt=${expiresAt?.toISOString() ?? 'unknown'} refreshStored=${Boolean(tokens.refresh_token)} scopePreview=${(tokens.scope ?? '').slice(0, 48)}${(tokens.scope?.length ?? 0) > 48 ? '…' : ''}`,
    );
  }

  /** Remove expired CSRF state rows (best-effort housekeeping). */
  async deleteExpiredOAuthStates(): Promise<void> {
    await this.pool.query(`DELETE FROM oauth_states WHERE expires_at < now()`);
  }

  /**
   * Store a random `state` bound to `sessionId` for CSRF protection on callback.
   * Returns the opaque state value and its expiry.
   */
  async insertOAuthState(
    sessionId: string,
  ): Promise<{ state: string; expiresAt: Date }> {
    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.pool.query(
      `
      INSERT INTO oauth_states (state, session_id, expires_at)
      VALUES ($1, $2, $3)
      `,
      [state, sessionId.trim(), expiresAt],
    );
    return { state, expiresAt };
  }

  /**
   * Atomically consume a valid state row (one-time use) and return the session id.
   */
  async consumeOAuthState(state: string): Promise<string | null> {
    const st = await this.pool.query<{ session_id: string }>(
      `DELETE FROM oauth_states WHERE state = $1 AND expires_at >= now() RETURNING session_id`,
      [state.trim()],
    );
    return st.rows[0]?.session_id ?? null;
  }
}
