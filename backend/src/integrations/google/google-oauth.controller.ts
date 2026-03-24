import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { GoogleOAuthService } from './google-oauth.service';

@Controller('integrations/google')
export class GoogleOAuthController {
  constructor(
    private readonly googleOAuth: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * JSON endpoint the frontend calls with the browser `sessionId` before redirecting the user to Google.
   */
  @Get('start')
  async start(@Query('sessionId') sessionId: string | undefined) {
    if (!sessionId?.trim()) {
      throw new BadRequestException('sessionId query parameter is required');
    }
    const url = await this.googleOAuth.createAuthorizationUrl(sessionId);
    return { url };
  }

  /**
   * Google redirects the browser here after consent. We exchange the code, save tokens, then send the user back to the Next.js app.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const frontendBase = this.frontendBaseUrl();

    const redirectWith = (path: string) => {
      res.redirect(302, `${frontendBase}${path}`);
    };

    try {
      if (oauthError === 'access_denied') {
        redirectWith('/?google=cancelled');
        return;
      }

      await this.googleOAuth.handleCallback(code, state, oauthError);
      redirectWith('/?google=connected');
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? err.message
          : err instanceof ServiceUnavailableException
            ? err.message
            : 'oauth_failed';
      redirectWith(
        `/?google=error&reason=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * Lets the UI show “Google connected” without exposing tokens.
   */
  @Get('status')
  async status(@Query('sessionId') sessionId: string | undefined) {
    if (!sessionId?.trim()) {
      throw new BadRequestException('sessionId query parameter is required');
    }
    const connected = await this.googleOAuth.isConnected(sessionId);
    return { connected };
  }

  private frontendBaseUrl(): string {
    const raw =
      this.config.get<string>('FRONTEND_URL')?.trim() ||
      'http://localhost:3000';
    return raw.replace(/\/$/, '');
  }
}
