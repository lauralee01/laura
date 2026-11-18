import { Test, TestingModule } from '@nestjs/testing';
import { ChatHistoryService } from '../../chat-history.service';
import { MemoryService } from '../../../memory/memory.service';
import { WeeklyReviewHandler } from './weekly-review.handler';

describe('WeeklyReviewHandler', () => {
  let handler: WeeklyReviewHandler;
  let listConversations: jest.Mock;
  let listMemories: jest.Mock;
  let searchMemories: jest.Mock;

  beforeEach(async () => {
    listConversations = jest.fn().mockResolvedValue([]);
    listMemories = jest.fn().mockResolvedValue([]);
    searchMemories = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyReviewHandler,
        {
          provide: ChatHistoryService,
          useValue: { listConversations },
        },
        {
          provide: MemoryService,
          useValue: { listMemories, searchMemories },
        },
      ],
    }).compile();

    handler = module.get(WeeklyReviewHandler);
  });

  it('builds a review with empty chats/memories and invites reflection', async () => {
    const text = await handler.handleWeeklyReview(
      'sess-1',
      'America/Chicago',
    );

    expect(listConversations).toHaveBeenCalledWith('sess-1');
    expect(listMemories).toHaveBeenCalledWith('sess-1');
    expect(searchMemories).toHaveBeenCalled();
    expect(text).toMatch(/weekly review/i);
    expect(text).toMatch(/No chats in the last 7 days/i);
    expect(text).toMatch(/Nothing stored yet/i);
    expect(text).toMatch(/Close the loop/i);
    expect(text).toMatch(/Structured weekly goals aren't set up yet/i);
  });

  it('lists recent chats and memories', async () => {
    const recent = new Date().toISOString();
    listConversations.mockResolvedValue([
      {
        id: 'c1',
        updatedAt: recent,
        preview: 'Plan the product launch',
      },
    ]);
    listMemories.mockResolvedValue([
      {
        id: 1,
        content: 'Prefers morning deep work',
        createdAt: recent,
      },
    ]);
    searchMemories.mockResolvedValue([
      {
        id: 2,
        content: 'Still needs to send the invoice',
        distance: 0.1,
      },
    ]);

    const text = await handler.handleWeeklyReview('sess-1', 'UTC');

    expect(text).toMatch(/Plan the product launch/i);
    expect(text).toMatch(/Prefers morning deep work/i);
    expect(text).toMatch(/send the invoice/i);
  });

  it('survives history/memory failures', async () => {
    listConversations.mockRejectedValue(new Error('db down'));
    listMemories.mockRejectedValue(new Error('mem down'));
    searchMemories.mockRejectedValue(new Error('search down'));

    const text = await handler.handleWeeklyReview('sess-1', null);

    expect(text).toMatch(/couldn't load this week's chats/i);
    expect(text).toMatch(/couldn't load memories/i);
    expect(text).toMatch(/Close the loop/i);
  });
});
