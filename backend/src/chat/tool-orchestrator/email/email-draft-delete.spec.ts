import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../../integrations/email/email.service';
import { LlmService } from '../../../llm/llm.service';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import {
  EmailToolHandler,
  isEmailDraftDeleteRequest,
} from './email-tool.handler';

function envelope(
  intent: IntentEnvelope['intent'],
  slots: Record<string, unknown> = {},
): IntentEnvelope {
  return {
    version: 1,
    intent,
    confidence: 0.9,
    confidenceKnown: true,
    missingSlots: [],
    slots,
  };
}

describe('isEmailDraftDeleteRequest', () => {
  it('matches email_draft_delete intent', () => {
    expect(
      isEmailDraftDeleteRequest('please', envelope('email_draft_delete')),
    ).toBe(true);
  });

  it('matches revise + action delete (classifier shape from the bug)', () => {
    expect(
      isEmailDraftDeleteRequest(
        'alrightie, delete the draft message',
        envelope('email_draft_revise', { action: 'delete' }),
      ),
    ).toBe(true);
  });

  it('matches cancel-the-draft wording', () => {
    expect(
      isEmailDraftDeleteRequest(
        "No, don't send it, cancel the draft message",
        envelope('pending_cancel'),
      ),
    ).toBe(true);
  });

  it('does not match plain send cancel', () => {
    expect(
      isEmailDraftDeleteRequest(
        "No don't send it",
        envelope('pending_cancel'),
      ),
    ).toBe(false);
  });
});

describe('EmailToolHandler draft delete', () => {
  let handler: EmailToolHandler;
  let deleteDraft: jest.Mock;
  let clearPending: jest.Mock;
  let clearLastEmailDraft: jest.Mock;
  let getPending: jest.Mock;
  let getLastEmailDraft: jest.Mock;

  beforeEach(async () => {
    deleteDraft = jest.fn().mockResolvedValue(undefined);
    clearPending = jest.fn().mockResolvedValue(undefined);
    clearLastEmailDraft = jest.fn().mockResolvedValue(undefined);
    getPending = jest.fn().mockResolvedValue(null);
    getLastEmailDraft = jest.fn().mockResolvedValue({
      draftId: 'draft-1',
      recipients: ['martha@example.com'],
      subject: 'Holiday Tomorrow',
      body: 'Hi Martha',
      updatedAt: Date.now(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailToolHandler,
        { provide: LlmService, useValue: { generate: jest.fn() } },
        {
          provide: EmailService,
          useValue: { deleteDraft, draftEmail: jest.fn(), sendDraft: jest.fn() },
        },
        {
          provide: PendingRequestService,
          useValue: {
            getPending,
            setPending: jest.fn(),
            clearPending,
          },
        },
        {
          provide: SessionPreferencesService,
          useValue: {
            getLastEmailDraft,
            setLastEmailDraft: jest.fn(),
            clearLastEmailDraft,
          },
        },
      ],
    }).compile();

    handler = module.get(EmailToolHandler);
  });

  it('deletes via lastEmailDraft after send pending was cleared', async () => {
    const reply = await handler.handleEmailDraftFollowUp(
      'sess-1',
      'alrightie, delete the draft message',
      envelope('email_draft_revise', { action: 'delete' }),
    );

    expect(deleteDraft).toHaveBeenCalledWith('sess-1', 'draft-1');
    expect(clearPending).toHaveBeenCalledWith('sess-1', 'email_send');
    expect(clearLastEmailDraft).toHaveBeenCalledWith('sess-1');
    expect(reply).toEqual(
      expect.objectContaining({
        text: expect.stringMatching(/deleted/i),
        receipt: expect.objectContaining({
          kind: 'email_draft_deleted',
          title: 'Draft deleted from Gmail',
        }),
      }),
    );
  });

  it('does not claim delete when no draft is remembered', async () => {
    getLastEmailDraft.mockResolvedValue(null);
    const reply = await handler.handleEmailDraftFollowUp(
      'sess-1',
      'delete the draft',
      envelope('email_draft_delete'),
    );

    expect(deleteDraft).not.toHaveBeenCalled();
    expect(reply).toMatch(/don’t have a recent Gmail draft/i);
  });
});
