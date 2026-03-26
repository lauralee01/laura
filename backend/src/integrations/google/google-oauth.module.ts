import { Module } from '@nestjs/common';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import { GoogleOAuthService } from './google-oauth.service';

@Module({
  controllers: [GoogleOAuthController],
  providers: [GoogleOAuthPersistenceService, GoogleOAuthService],
  exports: [GoogleOAuthService],
})
export class GoogleOAuthModule {}
