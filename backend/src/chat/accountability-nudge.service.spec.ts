import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from '../memory/memory.service';
import { AccountabilityNudgeService } from './accountability-nudge.service';
import { SessionPreferencesService } from './session-preferences.service';

describe('AccountabilityNudgeService', () => {
  let service: AccountabilityNudgeService;
  let searchMemories: jest.Mock;
  let getAccountabilityNudge: jest.Mock;
  let setAccountabilityNudge: jest.Mock;

  beforeEach(async () => {
    searchMemories = jest.fn().mockResolvedValue([]);
    getAccountabilityNudge = jest.fn().mockResolvedValue(null);
    setAccountabilityNudge = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountabilityNudgeService,
        {
          provide: MemoryService,
          useValue: { searchMemories },
        },
        {
          provide: SessionPreferencesService,
          useValue: { getAccountabilityNudge, setAccountabilityNudge },
        },
      ],
    }).compile();

    service = module.get(AccountabilityNudgeService);
  });

  it('returns null when cooldown is active', async () => {
    getAccountabilityNudge.mockResolvedValue({
      memoryId: 9,
      shownAt: Date.now() - 60_000,
    });

    const suggestion = await service.getSuggestion('sess-1');

    expect(suggestion).toBeNull();
    expect(searchMemories).not.toHaveBeenCalled();
  });

  it('returns null when no actionable memory exists', async () => {
    searchMemories.mockResolvedValue([
      {
        id: 1,
        content: 'Prefers morning deep work',
        createdAt: new Date().toISOString(),
        distance: 0.2,
      },
      {
        id: 2,
        content: 'short',
        createdAt: new Date().toISOString(),
        distance: 0.1,
      },
    ]);

    const suggestion = await service.getSuggestion('sess-1');

    expect(suggestion).toBeNull();
    expect(setAccountabilityNudge).not.toHaveBeenCalled();
  });

  it('returns a soft chip and records cooldown', async () => {
    searchMemories.mockResolvedValue([
      {
        id: 42,
        content: 'Still needs to send the invoice to Alex',
        createdAt: new Date().toISOString(),
        distance: 0.18,
      },
    ]);

    const suggestion = await service.getSuggestion('sess-1');

    expect(suggestion?.memoryId).toBe(42);
    expect(suggestion?.label).toMatch(/invoice/i);
    expect(suggestion?.prompt).toMatch(/next step/i);
    expect(setAccountabilityNudge).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ memoryId: 42 }),
    );
  });
});
