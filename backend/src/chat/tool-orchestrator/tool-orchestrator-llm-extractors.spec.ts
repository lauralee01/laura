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
    it('extracts name + context without requiring @ in the message', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          recipients: [],
          recipientName: 'Jane',
          subject: null,
          tone: null,
          context: 'about the offer',
        }),
      );

      const result = await extractDraftEmailArgs(
        mockLlmService,
        'Email Jane about the offer',
      );

      expect(mockLlmService.generate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        recipients: [],
        recipientName: 'Jane',
        subject: undefined,
        tone: undefined,
        context: 'about the offer',
      });
    });

    it('extracts email draft args when email is present in message', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          recipients: ['alice@example.com'],
          recipientName: null,
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
        recipientName: undefined,
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

    it('uses complete Stage-1 slots and skips the LLM', async () => {
      const result = await extractCalendarEventArgs(
        mockLlmService,
        'Schedule lunch with Sam tomorrow at noon',
        'America/Chicago',
        {
          title: 'Lunch with Sam',
          start: '2026-11-03T12:00:00',
          end: '2026-11-03T13:00:00',
        },
      );

      expect(mockLlmService.generate).not.toHaveBeenCalled();
      expect(result).toEqual({
        title: 'Lunch with Sam',
        start: '2026-11-03T12:00:00',
        end: '2026-11-03T13:00:00',
        description: undefined,
      });
    });

    it('calls generate with errorMode throw for tool extraction', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          title: 'Standup',
          start: '2026-11-03T09:00:00',
          end: '2026-11-03T09:30:00',
        }),
      );

      await extractCalendarEventArgs(
        mockLlmService,
        'Standup at 9',
        'America/Chicago',
      );

      expect(mockLlmService.generate).toHaveBeenCalledWith(
        expect.objectContaining({ errorMode: 'throw' }),
      );
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

    it('forces preferred Stage-1 operation over a conflicting LLM operation', async () => {
      mockLlmService.generate.mockResolvedValue(
        JSON.stringify({
          operation: 'update',
          titleKeywords: 'dentist',
          dayOffset: 1,
          weekOffset: null,
          searchWholeWeek: false,
          searchNextDays: null,
          newTitle: 'New title',
          newStart: null,
          newEnd: null,
        }),
      );

      const result = await extractCalendarMutationArgs(
        mockLlmService,
        'Cancel dentist tomorrow',
        'America/New_York',
        'delete',
      );

      expect(result?.operation).toBe('delete');
      expect(result?.newTitle).toBeNull();
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
