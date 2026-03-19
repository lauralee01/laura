import { Body, Controller, Post } from '@nestjs/common';
import { CalendarService } from './calendar.service';

type CreateCalendarEventRequest = {
  sessionId?: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
};

@Controller('tools/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('create')
  async create(@Body() body: CreateCalendarEventRequest) {
    return this.calendarService.createEvent(body);
  }
}

