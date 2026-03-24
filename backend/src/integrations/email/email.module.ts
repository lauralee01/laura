import { Module } from '@nestjs/common';
import { GoogleOAuthModule } from '../google/google-oauth.module';
import { LlmModule } from '../../llm/llm.module';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

@Module({
  imports: [GoogleOAuthModule, LlmModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
