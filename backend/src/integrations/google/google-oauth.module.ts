import { Module } from '@nestjs/common';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { GoogleOAuthCredentialsService } from './google-oauth-credentials.service';
import { GoogleOAuthFlowService } from './google-oauth-flow.service';
import { GoogleOAuthPersistenceService } from './google-oauth-persistence.service';
import { GoogleOAuthService } from './google-oauth.service';

@Module({
  controllers: [GoogleOAuthController],
  providers: [
    GoogleOAuthPersistenceService,
    GoogleOAuthConfigService,
    GoogleOAuthCredentialsService,
    GoogleOAuthFlowService,
    GoogleOAuthService,
  ],
  exports: [GoogleOAuthService],
})
export class GoogleOAuthModule {}
