import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { getSessionId } from '../../common/session/session.util';
import { EmailService, type DraftEmailInput } from './email.service';

type DraftEmailBody = Omit<DraftEmailInput, 'sessionId'>;

@Controller('tools/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('draft')
  async draft(@Req() req: Request, @Body() body: DraftEmailBody) {
    const sessionId = getSessionId(req);
    return this.emailService.draftEmail({ ...body, sessionId });
  }
}
