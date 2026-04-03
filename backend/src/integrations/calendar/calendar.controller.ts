import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { getSessionId } from '../../common/session/session.util';
import { CalendarService } from './calendar.service';
import type {
  CreateCalendarEventInput,
  ListCalendarEventsInput,
} from './calendar.types';

type CreateCalendarEventBody = Omit<CreateCalendarEventInput, 'sessionId'>;
type ListCalendarEventsBody = Omit<ListCalendarEventsInput, 'sessionId'>;

@Controller('tools/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('create')
  async create(@Req() req: Request, @Body() body: CreateCalendarEventBody) {
    const sessionId = getSessionId(req);
    return this.calendarService.createEvent({ ...body, sessionId });
  }

  @Post('list')
  async list(@Req() req: Request, @Body() body: ListCalendarEventsBody) {
    const sessionId = getSessionId(req);
    return this.calendarService.listEvents({ ...body, sessionId });
  }
}
