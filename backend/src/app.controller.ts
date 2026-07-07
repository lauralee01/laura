
import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { SessionPreferencesService } from './chat/session-preferences.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('session')
  sessionBootstrap(): { ok: true } {
    return { ok: true };
  }

  @Patch('session')
  async updateSession(
    @Req() req: Request,
    @Body() body: { timeZone?: string },
  ): Promise<{ ok: true }> {
    const sessionId = req.cookies?.laura_session;

    if (body.timeZone?.trim() && sessionId) {
      await this.sessionPreferences.setTimeZone(
        sessionId,
        body.timeZone.trim(),
      );
    }

    return { ok: true };
  }
}