import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import { exchangeAuthorizationCodeForTokens } from './google-oauth-token-http';
import { sessionFingerprint as fingerprintSession, tryHost } from './google-oauth.utils';

/**
 * OAuth consent URL construction and callback handling (code → tokens).
 */
@Injectable()
export class GoogleOAuthFlowService {
  private readonly logger = new Logger(GoogleOAuthFlowService.name);

  constructor(
    private readonly config: GoogleOAuthConfigService,
    private readonly persistence: GoogleOAuthPersistenceService,
  ) {}

  async createAuthorizationUrl(sessionId: string): Promise<string> {
    this.config.assertConfigured();

    const sid = sessionId.trim();
    if (!sid) {
      throw new BadRequestException('sessionId is required');
    }

    const { clientId, redirectUri } = this.config.getClientSecrets();
    const scopes = this.config.getScopes();

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

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
  ): Promise<{ sessionId: string }> {
    this.config.assertConfigured();

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

    const { clientId, clientSecret, redirectUri } = this.config.getClientSecrets();

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
}
