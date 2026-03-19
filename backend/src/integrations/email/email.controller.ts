import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';

type DraftEmailRequest = {
  sessionId?: string;
  recipients: string[];
  subject?: string;
  tone?: string;
  context: string;
};

@Controller('tools/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('draft')
  async draft(@Body() body: DraftEmailRequest) {
    return this.emailService.draftEmail(body);
  }
}

