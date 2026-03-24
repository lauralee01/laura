import { Module } from '@nestjs/common';
import { GoogleOAuthModule } from '../google/google-oauth.module';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

@Module({
  imports: [GoogleOAuthModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
