import {
  extractDraftEmailArgs,
  extractCalendarEventArgs,
  extractCalendarMutationArgs,
} from './tool-orchestrator-llm-extractors';
import type { LlmService } from '../../llm/llm.service';

describe('ToolOrchestratorLlmExtractors', () => {
  let mockLlmService: jest.Mocked<LlmService>;

  beforeEach(() => {
    mockLlmService = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<LlmService>;
  });

  describe('extractDraftEmailArgs', () => {
    it('returns null immediately without calling LLM if no email address is in message (fast-path)', async () => {
      const result = await extractDraftEmailArgs(
        mockLlmService,
        'Draft an email to John saying I will be late',
      );

      expect(result).toBeNull();
      expect(mockLlmService.generate).not.toHaveBeenCalled();
    });

    it('extracts email draft args when email is present in message', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          recipients: ['alice@example.com'],
          subject: 'Project Update',
          tone: 'professional',
          context: 'Here is the progress report.',
        }),
      );

      const result = await extractDraftEmailArgs(
        mockLlmService,
        'Email alice@example.com with subject Project Update',
      );

      expect(mockLlmService.generate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        recipients: ['alice@example.com'],
        subject: 'Project Update',
        tone: 'professional',
        context: 'Here is the progress report.',
      });
    });

    it('returns null if message is empty or whitespace', async () => {
      const result = await extractDraftEmailArgs(mockLlmService, '   ');
      expect(result).toBeNull();
      expect(mockLlmService.generate).not.toHaveBeenCalled();
    });
  });

  describe('extractCalendarEventArgs', () => {
    it('returns null if message is empty', async () => {
      const result = await extractCalendarEventArgs(
        mockLlmService,
        '',
        'America/New_York',
      );
      expect(result).toBeNull();
      expect(mockLlmService.generate).not.toHaveBeenCalled();
    });

    it('extracts valid calendar event args', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          title: 'Dentist appointment',
          start: '2026-08-01T10:00:00',
          end: '2026-08-01T11:00:00',
          description: 'Routine checkup',
          reminderMinutesBefore: 30,
        }),
      );

      const result = await extractCalendarEventArgs(
        mockLlmService,
        'Dentist tomorrow at 10am',
        'America/New_York',
      );

      expect(result).toEqual({
        title: 'Dentist appointment',
        start: '2026-08-01T10:00:00',
        end: '2026-08-01T11:00:00',
        description: 'Routine checkup',
        reminderMinutesBefore: 30,
      });
    });

    it('returns null if essential fields are missing in LLM response', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          title: 'Dentist',
          start: null,
          end: null,
        }),
      );

      const result = await extractCalendarEventArgs(
        mockLlmService,
        'Dentist event',
        'America/New_York',
      );

      expect(result).toBeNull();
    });
  });

  describe('extractCalendarMutationArgs', () => {
    it('extracts delete mutation args', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          operation: 'delete',
          titleKeywords: 'dentist',
          dayOffset: 1,
          weekOffset: null,
          searchWholeWeek: false,
          searchNextDays: null,
          newTitle: null,
          newStart: null,
          newEnd: null,
        }),
      );

      const result = await extractCalendarMutationArgs(
        mockLlmService,
        'Cancel dentist tomorrow',
        'America/New_York',
      );

      expect(result).toEqual({
        operation: 'delete',
        titleKeywords: 'dentist',
        dayOffset: 1,
        weekOffset: null,
        searchWholeWeek: false,
        searchNextDays: null,
        newTitle: null,
        newStart: null,
        newEnd: null,
      });
    });

    it('returns null if operation is unknown', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          operation: 'unknown',
          titleKeywords: 'dentist',
        }),
      );

      const result = await extractCalendarMutationArgs(
        mockLlmService,
        'Do something to dentist',
        'America/New_York',
      );

      expect(result).toBeNull();
    });
  });
});
