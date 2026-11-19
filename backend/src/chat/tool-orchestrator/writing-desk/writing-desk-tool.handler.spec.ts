import { Test, TestingModule } from '@nestjs/testing';
import { WritingDeskService } from '../../../writing-desk/writing-desk.service';
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

  beforeEach(async () => {
    createDraft = jest.fn();
    updateDraft = jest.fn();
    listDrafts = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingDeskToolHandler,
        {
          provide: WritingDeskService,
          useValue: { createDraft, updateDraft, listDrafts },
        },
      ],
    }).compile();

    handler = module.get(WritingDeskToolHandler);
  });

  it('asks for text when body is missing', async () => {
    const reply = await handler.handleSave(
      'sess-1',
      envelope('writing_desk_save', { title: 'Bio' }),
    );

    expect(typeof reply === 'object' ? reply.text : reply).toMatch(
      /paste the text/i,
    );
    expect(createDraft).not.toHaveBeenCalled();
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
