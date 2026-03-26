import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { GoogleTokenResponse } from './google-oauth.types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

type TokenErrorBody = GoogleTokenResponse & {
  error?: string;
  error_description?: string;
};

/**
 * Calls Google’s OAuth2 token endpoint to trade an authorization `code` for tokens.
 * Must use the same redirect_uri as in the consent URL.
 */
export async function exchangeAuthorizationCodeForTokens(
  logger: Logger,
  params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as TokenErrorBody;

  if (!res.ok) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    logger.error(
      `[OAuth] token exchange failed http=${res.status} error=${json.error ?? 'unknown'} desc=${(json.error_description ?? '').slice(0, 120)}`,
    );
    throw new InternalServerErrorException(`Token exchange failed: ${msg}`);
  }
  if (!json.access_token) {
    logger.error('[OAuth] token response missing access_token');
    throw new InternalServerErrorException(
      'Token response missing access_token',
    );
  }

  logger.log(
    `[OAuth] token exchange OK expires_in=${json.expires_in ?? '?'}s hasRefresh=${Boolean(json.refresh_token)} tokenType=${json.token_type ?? 'Bearer'}`,
  );

  return json;
}

/**
 * Obtains a new access token using a long-lived refresh_token (no redirect involved).
 */
export async function exchangeRefreshTokenForAccess(
  logger: Logger,
  params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  },
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as TokenErrorBody;

  if (!res.ok) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    logger.error(
      `[OAuth] refresh token failed http=${res.status} error=${json.error ?? ''}`,
    );
    throw new BadRequestException(
      `Google session could not be renewed: ${msg}. Please connect Google again.`,
    );
  }
  if (!json.access_token) {
    throw new InternalServerErrorException(
      'Refresh response missing access_token',
    );
  }

  logger.log(
    `[OAuth] token refresh OK expires_in=${json.expires_in ?? '?'}s`,
  );
  return json;
}
