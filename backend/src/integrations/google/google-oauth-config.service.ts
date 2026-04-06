import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_GOOGLE_OAUTH_SCOPES } from './google-oauth.constants';

export type GoogleOAuthClientSecrets = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Reads and validates Google OAuth env (client id, secret, redirect, scopes).
 */
@Injectable()
export class GoogleOAuthConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Throws if any required OAuth env var is missing. */
  assertConfigured(): void {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const secret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim();
    if (!clientId || !secret || !redirect) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)',
      );
    }
  }

  getClientSecrets(): GoogleOAuthClientSecrets {
    return {
      clientId: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID').trim(),
      clientSecret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET').trim(),
      redirectUri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI').trim(),
    };
  }

  getScopes(): string {
    return (
      this.config.get<string>('GOOGLE_OAUTH_SCOPES')?.trim() ||
      DEFAULT_GOOGLE_OAUTH_SCOPES
    );
  }
}
