import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

/** Tokens loaded from DB for Gmail / Calendar API calls (refresh flow comes later). */
export type GoogleCredentials = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: Date | null;
};

@Injectable()
export class GoogleOAuthService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
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
   * Returns stored Google tokens for a browser session (for Gmail / Calendar APIs).
   * Returns null if the user has not completed OAuth.
   */
  async getCredentialsForSession(
    sessionId: string,
  ): Promise<GoogleCredentials | null> {
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

  async isConnected(sessionId: string): Promise<boolean> {
    const tokens = await this.getCredentialsForSession(sessionId);
    return tokens !== null;
  }

  /**
   * Build the Google consent URL and persist `state` → `sessionId` for the callback.
   */
  async createAuthorizationUrl(sessionId: string): Promise<string> {
    this.assertOAuthConfig();

    const sid = sessionId.trim();
    if (!sid) {
      throw new BadRequestException('sessionId is required');
    }

    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim();
    const redirectUri = this.config
      .getOrThrow<string>('GOOGLE_REDIRECT_URI')
      .trim();
    const scopes =
      this.config.get<string>('GOOGLE_OAUTH_SCOPES')?.trim() || DEFAULT_SCOPES;

    const state = randomBytes(32).toString('hex');

    await this.pool.query(`DELETE FROM oauth_states WHERE expires_at < now()`);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.pool.query(
      `
      INSERT INTO oauth_states (state, session_id, expires_at)
      VALUES ($1, $2, $3)
      `,
      [state, sid, expiresAt],
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    console.log('params', params.toString());

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Validate `state`, exchange `code` for tokens, store under the original session id.
   */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
  ): Promise<{ sessionId: string }> {
    this.assertOAuthConfig();

    if (oauthError) {
      throw new BadRequestException(
        `Google OAuth error: ${oauthError || 'unknown'}`,
      );
    }
    if (!code?.trim() || !state?.trim()) {
      throw new BadRequestException('Missing code or state');
    }

    const st = await this.pool.query<{ session_id: string }>(
      `DELETE FROM oauth_states WHERE state = $1 AND expires_at >= now() RETURNING session_id`,
      [state.trim()],
    );
    const sessionId = st.rows[0]?.session_id;
    if (!sessionId) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const tokens = await this.exchangeCodeForTokens(code.trim());
    await this.saveTokens(sessionId, tokens);

    return { sessionId };
  }

  private async exchangeCodeForTokens(
    code: string,
  ): Promise<GoogleTokenResponse> {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim();
    const clientSecret = this.config
      .getOrThrow<string>('GOOGLE_CLIENT_SECRET')
      .trim();
    const redirectUri = this.config
      .getOrThrow<string>('GOOGLE_REDIRECT_URI')
      .trim();

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const json = (await res.json()) as GoogleTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (!res.ok) {
      const msg = json.error_description || json.error || `HTTP ${res.status}`;
      throw new InternalServerErrorException(`Token exchange failed: ${msg}`);
    }
    if (!json.access_token) {
      throw new InternalServerErrorException(
        'Token response missing access_token',
      );
    }
    return json;
  }

  private async saveTokens(
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
  }

  private assertOAuthConfig(): void {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const secret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim();
    if (!clientId || !secret || !redirect) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)',
      );
    }
  }

  /** Stable fingerprint of session id for logs (never log raw session id). */
  sessionFingerprint(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex').slice(0, 12);
  }
}
