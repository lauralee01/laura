/** Raw token payload from Google’s token endpoint (authorization_code or refresh). */
export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

/** Tokens loaded from DB for Gmail / Calendar API calls. */
export type GoogleCredentials = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: Date | null;
};
