import { Injectable } from '@nestjs/common';
import { GoogleOAuthCredentialsService } from './google-oauth-credentials.service';
import { GoogleOAuthFlowService } from './google-oauth-flow.service';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import type { OAuth2Client } from 'google-auth-library';
import type { GoogleCredentials } from './google-oauth.types';
import { sessionFingerprint as fingerprintSession } from './google-oauth.utils';

export type { GoogleCredentials } from './google-oauth.types';

/**
 * Public facade: session token lookup, OAuth2 client for APIs, consent flow.
 * Implementation is split across config, credentials, flow, and persistence services.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly persistence: GoogleOAuthPersistenceService,
    private readonly credentials: GoogleOAuthCredentialsService,
    private readonly flow: GoogleOAuthFlowService,
  ) {}

  async getCredentialsForSession(
    sessionId: string,
  ): Promise<GoogleCredentials | null> {
    return this.persistence.loadCredentials(sessionId);
  }

  async isConnected(sessionId: string): Promise<boolean> {
    const tokens = await this.getCredentialsForSession(sessionId);
    return tokens !== null;
  }

  async getOAuth2ClientForSession(sessionId: string): Promise<OAuth2Client> {
    return this.credentials.getOAuth2ClientForSession(sessionId);
  }

  async createAuthorizationUrl(sessionId: string): Promise<string> {
    return this.flow.createAuthorizationUrl(sessionId);
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
  ): Promise<{ sessionId: string }> {
    return this.flow.handleCallback(code, state, oauthError);
  }

  /** Stable fingerprint of session id for logs (never log raw session id). */
  sessionFingerprint(sessionId: string): string {
    return fingerprintSession(sessionId);
  }
}
