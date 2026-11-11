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
import { MemoryService } from './memory.service';

type MemoryWriteRequest = {
  userId: string;
  content: string;
};

type MemoryWriteResponse = {
  id: number;
};

type MemorySearchRequest = {
  userId: string;
  query: string;
  topK?: number;
};

type MemorySearchResponse = {
  results: Array<{
    id: number;
    content: string;
    createdAt: string;
    distance: number;
  }>;
};

type MemoryListResponse = {
  memories: Array<{
    id: number;
    content: string;
    createdAt: string;
  }>;
};

type MemoryPatchBody = {
  content?: string;
};

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  /** Session-scoped list for the memory browser UI. */
  @Get()
  async list(@Req() req: Request): Promise<MemoryListResponse> {
    const sessionId = getSessionId(req);
    const memories = await this.memoryService.listMemories(sessionId);
    return { memories };
  }

  /** Session-scoped edit (re-embeds content). */
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') idParam: string,
    @Body() body: MemoryPatchBody,
  ): Promise<{ memory: { id: number; content: string; createdAt: string } }> {
    const sessionId = getSessionId(req);
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid memory id');
    }

    const content = typeof body?.content === 'string' ? body.content : '';
    if (!content.trim()) {
      throw new BadRequestException('content must not be empty');
    }

    try {
      const memory = await this.memoryService.updateMemory(
        sessionId,
        id,
        content,
      );
      if (!memory) {
        throw new NotFoundException('Memory not found');
      }
      return { memory };
    } catch (err: unknown) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.includes('content must not be empty')) {
        throw new BadRequestException(message);
      }
      throw err;
    }
  }

  /** Session-scoped delete. */
  @Delete(':id')
  async remove(
    @Req() req: Request,
    @Param('id') idParam: string,
  ): Promise<{ ok: true }> {
    const sessionId = getSessionId(req);
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Invalid memory id');
    }

    const deleted = await this.memoryService.deleteMemory(sessionId, id);
    if (!deleted) {
      throw new NotFoundException('Memory not found');
    }
    return { ok: true };
  }

  @Post('write')
  async write(@Body() body: MemoryWriteRequest): Promise<MemoryWriteResponse> {
    const id = await this.memoryService.writeMemory({
      userId: body.userId,
      content: body.content,
    });
    return { id };
  }

  @Post('search')
  async search(
    @Body() body: MemorySearchRequest,
  ): Promise<MemorySearchResponse> {
    const topK = body.topK ?? 5;

    const results = await this.memoryService.searchMemories({
      userId: body.userId,
      query: body.query,
      topK,
    });

    return { results };
  }
}
