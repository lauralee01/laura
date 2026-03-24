import { Module } from '@nestjs/common';
import { GoogleOAuthModule } from '../google/google-oauth.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [GoogleOAuthModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
