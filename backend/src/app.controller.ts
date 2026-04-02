import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Call once from the frontend (with credentials) so the HttpOnly session cookie is set
   * before other API calls. No sensitive data in the body — the cookie is the session.
   */
  @Get('session')
  sessionBootstrap(): { ok: true } {
    return { ok: true };
  }
}
