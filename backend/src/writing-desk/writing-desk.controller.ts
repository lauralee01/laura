import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { getSessionId } from '../common/session/session.util';
import { WritingDeskService } from './writing-desk.service';
import type { WritingDraft, WritingDraftSummary } from './writing-desk.types';

type CreateBody = {
  title?: string;
  body?: string;
  tone?: string | null;
};

type PatchBody = {
  title?: string;
  body?: string;
  tone?: string | null;
};

@Controller('writing-desk')
export class WritingDeskController {
  constructor(private readonly writingDesk: WritingDeskService) {}

  @Get()
  async list(
    @Req() req: Request,
  ): Promise<{ drafts: WritingDraftSummary[] }> {
    const sessionId = getSessionId(req);
    const drafts = await this.writingDesk.listDrafts(sessionId);
    return { drafts };
  }

  @Get(':id')
  async getOne(
    @Req() req: Request,
    @Param('id') idParam: string,
  ): Promise<{ draft: WritingDraft }> {
    const sessionId = getSessionId(req);
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid draft id');
    }
    const draft = await this.writingDesk.getDraft(sessionId, id);
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    return { draft };
  }

  @Post()
  async create(
    @Req() req: Request,
    @Body() body: CreateBody,
  ): Promise<{ draft: WritingDraft }> {
    const sessionId = getSessionId(req);
    const title = typeof body?.title === 'string' ? body.title : 'Untitled draft';
    const text = typeof body?.body === 'string' ? body.body : '';
    if (!text.trim()) {
      throw new BadRequestException('body must not be empty');
    }

    try {
      const draft = await this.writingDesk.createDraft(sessionId, {
        title,
        body: text,
        tone: body?.tone,
      });
      return { draft };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Create failed';
      if (message.includes('body must not be empty')) {
        throw new BadRequestException(message);
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') idParam: string,
    @Body() body: PatchBody,
  ): Promise<{ draft: WritingDraft }> {
    const sessionId = getSessionId(req);
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid draft id');
    }

    try {
      const draft = await this.writingDesk.updateDraft(sessionId, id, {
        title: typeof body?.title === 'string' ? body.title : undefined,
        body: typeof body?.body === 'string' ? body.body : undefined,
        tone: Object.prototype.hasOwnProperty.call(body ?? {}, 'tone')
          ? body.tone
          : undefined,
      });
      if (!draft) {
        throw new NotFoundException('Draft not found');
      }
      return { draft };
    } catch (err: unknown) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.includes('body must not be empty')) {
        throw new BadRequestException(message);
      }
      throw err;
    }
  }

  @Delete(':id')
  async remove(
    @Req() req: Request,
    @Param('id') idParam: string,
  ): Promise<{ ok: true }> {
    const sessionId = getSessionId(req);
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid draft id');
    }
    const ok = await this.writingDesk.deleteDraft(sessionId, id);
    if (!ok) {
      throw new NotFoundException('Draft not found');
    }
    return { ok: true };
  }
}
