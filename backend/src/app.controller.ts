import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { SessionPreferencesService } from './chat/session-preferences.service';
import {
  isSessionTone,
  normalizeMeetingMinutes,
  type SessionPrefs,
  type SessionTone,
} from './chat/session-prefs.types';
import { SlidingWindowLimiter } from './common/rate-limit/sliding-window.limiter';
import { getSessionId } from './common/session/session.util';
import { ReverseGeocodeService } from './integrations/geocode/reverse-geocode.service';
import { normalizeCoordinates } from './integrations/geocode/reverse-geocode.util';

type SessionPatchBody = {
  timeZone?: string;
  location?: string | null;
  tone?: string;
  defaultMeetingMinutes?: number;
};

type DetectLocationBody = {
  latitude?: unknown;
  longitude?: unknown;
};

/** Max location lookups per session per minute (protects the geocoder). */
const LOCATION_DETECT_MAX_PER_MINUTE = 6;

@Controller()
export class AppController {
  private readonly locationDetectLimiter = new SlidingWindowLimiter(
    LOCATION_DETECT_MAX_PER_MINUTE,
    60_000,
  );

  constructor(
    private readonly appService: AppService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly reverseGeocode: ReverseGeocodeService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('session')
  async sessionBootstrap(@Req() req: Request): Promise<
    { ok: true } & SessionPrefs
  > {
    const sessionId = getSessionId(req);
    const prefs = await this.sessionPreferences.getSessionPrefs(sessionId);
    return { ok: true, ...prefs };
  }

  @Patch('session')
  async updateSession(
    @Req() req: Request,
    @Body() body: SessionPatchBody,
  ): Promise<{ ok: true } & SessionPrefs> {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      throw new BadRequestException('Missing session');
    }

    if (typeof body?.timeZone === 'string' && body.timeZone.trim()) {
      await this.sessionPreferences.setTimeZone(
        sessionId,
        body.timeZone.trim(),
      );
    }

    if (body && 'location' in body) {
      if (body.location === null || body.location === '') {
        await this.sessionPreferences.clearLocation(sessionId);
      } else if (typeof body.location === 'string') {
        const loc = body.location.trim();
        if (loc) {
          await this.sessionPreferences.setLocation(sessionId, loc);
        } else {
          await this.sessionPreferences.clearLocation(sessionId);
        }
      }
    }

    if (typeof body?.tone === 'string') {
      if (!isSessionTone(body.tone)) {
        throw new BadRequestException(
          'tone must be one of: warm, concise, casual',
        );
      }
      await this.sessionPreferences.setTone(
        sessionId,
        body.tone as SessionTone,
      );
    }

    if (body?.defaultMeetingMinutes !== undefined) {
      const minutes = normalizeMeetingMinutes(body.defaultMeetingMinutes);
      if (minutes === null) {
        throw new BadRequestException(
          'defaultMeetingMinutes must be an integer between 15 and 180',
        );
      }
      await this.sessionPreferences.setDefaultMeetingMinutes(
        sessionId,
        minutes,
      );
    }

    const prefs = await this.sessionPreferences.getSessionPrefs(sessionId);
    return { ok: true, ...prefs };
  }

  /**
   * Browser geolocation -> city label. The browser sends coordinates once;
   * we round them, look up a coarse "City, ST" label, store only that label as
   * the session location, and discard the coordinates (never stored/logged).
   */
  @Post('session/location/detect')
  async detectLocation(
    @Req() req: Request,
    @Body() body: DetectLocationBody,
  ): Promise<{ ok: true; location: string }> {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      throw new BadRequestException('Missing session');
    }

    const coords = normalizeCoordinates(body?.latitude, body?.longitude);
    if (!coords) {
      throw new BadRequestException(
        'latitude and longitude must be valid numbers',
      );
    }

    if (!this.locationDetectLimiter.tryConsume(sessionId)) {
      throw new HttpException(
        'Too many location lookups. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const location = await this.reverseGeocode.reverse(
      coords.latitude,
      coords.longitude,
    );
    if (!location) {
      throw new ServiceUnavailableException(
        'Could not work out your city right now. Type a city instead.',
      );
    }

    await this.sessionPreferences.setLocation(sessionId, location);
    return { ok: true, location };
  }
}
