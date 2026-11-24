import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
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
import { getSessionId } from './common/session/session.util';

type SessionPatchBody = {
  timeZone?: string;
  location?: string | null;
  tone?: string;
  defaultMeetingMinutes?: number;
};

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly sessionPreferences: SessionPreferencesService,
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
}
