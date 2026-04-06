import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import { exchangeRefreshTokenForAccess } from './google-oauth-token-http';
import type { GoogleCredentials } from './google-oauth.types';
import { sessionFingerprint as fingerprintSession } from './google-oauth.utils';

/**
 * Loads stored tokens, refreshes access tokens when needed, and builds {@link OAuth2Client}
 * for Gmail / Calendar API calls.
 */
@Injectable()
export class GoogleOAuthCredentialsService {
  private readonly logger = new Logger(GoogleOAuthCredentialsService.name);

  constructor(
    private readonly config: GoogleOAuthConfigService,
    private readonly persistence: GoogleOAuthPersistenceService,
  ) {}

  async getOAuth2ClientForSession(sessionId: string): Promise<OAuth2Client> {
    this.config.assertConfigured();

    const sid = sessionId.trim();
    if (!sid) {
      throw new BadRequestException('sessionId is required');
    }

    let creds = await this.persistence.loadCredentials(sid);
    if (!creds) {
      throw new BadRequestException(
        'Google is not connected for this session. Use “Connect Google” in the app, then try again.',
      );
    }

    creds = await this.ensureFreshAccessToken(sid, creds);

    const { clientId, clientSecret, redirectUri } = this.config.getClientSecrets();
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken ?? undefined,
    });

    return client;
  }

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

    const { clientId, clientSecret } = this.config.getClientSecrets();

    const tokens = await exchangeRefreshTokenForAccess(this.logger, {
      refreshToken: creds.refreshToken,
      clientId,
      clientSecret,
    });
    await this.persistence.upsertTokens(sessionId, tokens);

    const next = await this.persistence.loadCredentials(sessionId);
    if (!next) {
      throw new InternalServerErrorException(
        'Could not reload credentials after refresh',
      );
    }
    return next;
  }
}
