import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { DEFAULT_GOOGLE_OAUTH_SCOPES } from './google-oauth.constants';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import {
  exchangeAuthorizationCodeForTokens,
  exchangeRefreshTokenForAccess,
} from './google-oauth-token-http';
import type { GoogleCredentials } from './google-oauth.types';
import { sessionFingerprint as fingerprintSession, tryHost } from './google-oauth.utils';

export type { GoogleCredentials } from './google-oauth.types';

/**
 * Orchestrates Google OAuth: consent URL, callback handling, token refresh,
 * and building an OAuth2Client for API calls. Delegates HTTP and DB to sibling modules.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly persistence: GoogleOAuthPersistenceService,
  ) {}

  /**
   * Returns stored Google tokens for a browser session (for Gmail / Calendar APIs).
   * Returns null if the user has not completed OAuth.
   */
  async getCredentialsForSession(
    sessionId: string,
  ): Promise<GoogleCredentials | null> {
    return this.persistence.loadCredentials(sessionId);
  }

  async isConnected(sessionId: string): Promise<boolean> {
    const tokens = await this.getCredentialsForSession(sessionId);
    return tokens !== null;
  }

  /**
   * OAuth2 client with a valid access token (refreshes using refresh_token when close to expiry).
   * Used by Gmail and Calendar integrations.
   */
  async getOAuth2ClientForSession(sessionId: string): Promise<OAuth2Client> {
    this.assertOAuthConfig();

    const sid = sessionId.trim();
    if (!sid) {
      throw new BadRequestException('sessionId is required');
    }

    let creds = await this.getCredentialsForSession(sid);
    if (!creds) {
      throw new BadRequestException(
        'Google is not connected for this session. Use “Connect Google” in the app, then try again.',
      );
    }

    creds = await this.ensureFreshAccessToken(sid, creds);

    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim();
    const clientSecret = this.config
      .getOrThrow<string>('GOOGLE_CLIENT_SECRET')
      .trim();
    const redirectUri = this.config
      .getOrThrow<string>('GOOGLE_REDIRECT_URI')
      .trim();

    const client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
    client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken ?? undefined,
    });

    return client;
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
      this.config.get<string>('GOOGLE_OAUTH_SCOPES')?.trim() ||
      DEFAULT_GOOGLE_OAUTH_SCOPES;

    await this.persistence.deleteExpiredOAuthStates();
    const { state, expiresAt } = await this.persistence.insertOAuthState(sid);

    const fp = fingerprintSession(sid);
    this.logger.log(
      `[OAuth] start → Google consent session=${fp} statePrefix=${state.slice(0, 8)}… stateExpiresAt=${expiresAt.toISOString()} redirectHost=${tryHost(redirectUri)}`,
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

    this.logger.log(
      `[OAuth] callback hit hasCode=${Boolean(code?.trim())} statePrefix=${state?.trim().slice(0, 8) ?? '∅'}… googleError=${oauthError ?? 'none'}`,
    );

    if (oauthError) {
      this.logger.warn(`[OAuth] Google returned error: ${oauthError}`);
      throw new BadRequestException(
        `Google OAuth error: ${oauthError || 'unknown'}`,
      );
    }
    if (!code?.trim() || !state?.trim()) {
      this.logger.warn('[OAuth] callback missing code or state');
      throw new BadRequestException('Missing code or state');
    }

    const sessionId = await this.persistence.consumeOAuthState(state.trim());
    if (!sessionId) {
      this.logger.warn(
        `[OAuth] invalid or expired state statePrefix=${state.trim().slice(0, 8)}…`,
      );
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const fp = fingerprintSession(sessionId);
    this.logger.log(`[OAuth] state OK, exchanging code session=${fp}`);

    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim();
    const clientSecret = this.config
      .getOrThrow<string>('GOOGLE_CLIENT_SECRET')
      .trim();
    const redirectUri = this.config
      .getOrThrow<string>('GOOGLE_REDIRECT_URI')
      .trim();

    const tokens = await exchangeAuthorizationCodeForTokens(this.logger, {
      code: code.trim(),
      clientId,
      clientSecret,
      redirectUri,
    });
    await this.persistence.upsertTokens(sessionId, tokens);

    this.logger.log(
      `[OAuth] flow complete session=${fp} — user can return to app`,
    );

    return { sessionId };
  }

  /**
   * When `expires_at` is within this many seconds, we obtain a new access_token with the refresh_token.
   */
  private shouldRefreshAccessToken(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return false;
    }
    return expiresAt.getTime() < Date.now() + 90_000;
  }

  private async ensureFreshAccessToken(
    sessionId: string,
    creds: GoogleCredentials,
  ): Promise<GoogleCredentials> {
    if (!this.shouldRefreshAccessToken(creds.expiresAt)) {
      return creds;
    }
    if (!creds.refreshToken) {
      throw new BadRequestException(
        'Your Google session expired. Please connect Google again.',
      );
    }

    this.logger.log(
      `[OAuth] refreshing access token session=${fingerprintSession(sessionId)}`,
    );

    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim();
    const clientSecret = this.config
      .getOrThrow<string>('GOOGLE_CLIENT_SECRET')
      .trim();

    const tokens = await exchangeRefreshTokenForAccess(this.logger, {
      refreshToken: creds.refreshToken,
      clientId,
      clientSecret,
    });
    await this.persistence.upsertTokens(sessionId, tokens);

    const next = await this.getCredentialsForSession(sessionId);
    if (!next) {
      throw new InternalServerErrorException(
        'Could not reload credentials after refresh',
      );
    }
    return next;
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
    return fingerprintSession(sessionId);
  }
}
