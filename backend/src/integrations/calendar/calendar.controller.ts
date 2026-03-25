import { Body, Controller, Post } from '@nestjs/common';
import { CalendarService } from './calendar.service';

type CreateCalendarEventRequest = {
  sessionId?: string;
  timeZone: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
};

type ListCalendarEventsRequest = {
  sessionId?: string;
  timeZone: string;
  start: string;
  end: string;
  maxEvents?: number;
};

@Controller('tools/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('create')
  async create(@Body() body: CreateCalendarEventRequest) {
    return this.calendarService.createEvent(body);
  }

  @Post('list')
  async list(@Body() body: ListCalendarEventsRequest) {
    return this.calendarService.listEvents(body);
  }
}
