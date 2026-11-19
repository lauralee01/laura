import { Test, TestingModule } from '@nestjs/testing';
import { WritingDeskService } from '../../../writing-desk/writing-desk.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import { WritingDeskToolHandler } from './writing-desk-tool.handler';
import type { IntentEnvelope } from '../../intent/intent.types';

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

describe('WritingDeskToolHandler', () => {
  let handler: WritingDeskToolHandler;
  let createDraft: jest.Mock;
  let updateDraft: jest.Mock;
  let listDrafts: jest.Mock;
  let setWritingDeskPending: jest.Mock;
  let clearWritingDeskPending: jest.Mock;

  beforeEach(async () => {
    createDraft = jest.fn();
    updateDraft = jest.fn();
    listDrafts = jest.fn().mockResolvedValue([]);
    setWritingDeskPending = jest.fn().mockResolvedValue(undefined);
    clearWritingDeskPending = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingDeskToolHandler,
        {
          provide: WritingDeskService,
          useValue: { createDraft, updateDraft, listDrafts },
        },
        {
          provide: SessionPreferencesService,
          useValue: { setWritingDeskPending, clearWritingDeskPending },
        },
      ],
    }).compile();

    handler = module.get(WritingDeskToolHandler);
  });

  it('asks for text and sets awaiting-body pending when body is missing', async () => {
    const reply = await handler.handleSave(
      'sess-1',
      'Can you add this to my writing desk',
      envelope('writing_desk_save', { title: 'Bio' }),
    );

    expect(typeof reply === 'object' ? reply.text : reply).toMatch(
      /paste the text/i,
    );
    expect(createDraft).not.toHaveBeenCalled();
    expect(setWritingDeskPending).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        type: 'writing_desk_awaiting_body',
        title: 'Bio',
      }),
    );
  });

  it('uses the pasted message as body when slots.body is empty', async () => {
    createDraft.mockResolvedValue({
      id: 1,
      title: 'Untitled draft',
      body: 'A'.repeat(50),
      tone: null,
      versions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pasted = 'A'.repeat(50);
    const reply = await handler.handleSave(
      'sess-1',
      pasted,
      envelope('writing_desk_save', {}),
    );

    expect(createDraft).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ body: pasted }),
    );
    expect(clearWritingDeskPending).toHaveBeenCalledWith('sess-1');
    expect(reply).toEqual(
      expect.objectContaining({
        receipt: expect.objectContaining({ kind: 'writing_draft_saved' }),
      }),
    );
  });

  it('saves a new draft with receipt', async () => {
    createDraft.mockResolvedValue({
      id: 1,
      title: 'Cover letter',
      body: 'Dear hiring manager…',
      tone: 'formal',
      versions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const reply = await handler.handleSave(
      'sess-1',
      'Save this to my writing desk',
      envelope('writing_desk_save', {
        title: 'Cover letter',
        body: 'Dear hiring manager…',
        tone: 'formal',
      }),
    );

    expect(createDraft).toHaveBeenCalled();
    expect(reply).toEqual(
      expect.objectContaining({
        receipt: expect.objectContaining({
          kind: 'writing_draft_saved',
          detail: 'Cover letter',
        }),
      }),
    );
  });

  it('lists empty desk helpfully', async () => {
    const reply = await handler.handleList('sess-1');
    expect(typeof reply === 'object' ? reply.text : reply).toMatch(
      /empty so far/i,
    );
  });
});
