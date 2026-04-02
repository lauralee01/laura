import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from '@nestjs/config';
import { MemoryModule } from './memory/memory.module';
import { EmailModule } from './integrations/email/email.module';
import { CalendarModule } from './integrations/calendar/calendar.module';
import { GoogleOAuthModule } from './integrations/google/google-oauth.module';
import { SessionCookieMiddleware } from './common/session/session-cookie.middleware';

@Module({
  // Loads `backend/.env` into `process.env` for the whole application.
  // `isGlobal: true` means we don't need to import ConfigModule in every feature module.
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatModule,
    MemoryModule,
    EmailModule,
    CalendarModule,
    GoogleOAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, SessionCookieMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionCookieMiddleware).forRoutes('*');
  }
}
