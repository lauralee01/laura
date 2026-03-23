import { Body, Controller, Post } from '@nestjs/common';
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

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

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
    console.log('body-search', body);
    console.log('topK-search', topK);

    const results = await this.memoryService.searchMemories({
      userId: body.userId,
      query: body.query,
      topK,
    });

    console.log('results-search', results);
    return { results };
  }
}
