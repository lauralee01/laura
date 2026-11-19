import { Injectable } from '@nestjs/common';
import { WritingDeskService } from '../../../writing-desk/writing-desk.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import { toolOk, toolText, type ToolReplyInput } from '../../action-receipt.types';
import type { IntentEnvelope } from '../../intent/intent.types';

/** Short commands are not draft bodies; pasted content usually is longer. */
const MIN_INLINE_BODY_CHARS = 40;

@Injectable()
export class WritingDeskToolHandler {
  constructor(
    private readonly writingDesk: WritingDeskService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) {}

  async handleSave(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    const slots = envelope?.slots ?? {};
    const title = slotString(slots.title) || 'Untitled draft';
    let body = slotString(slots.body);
    const tone = slotString(slots.tone) || null;
    const draftId = slotId(slots.draftId);

    if (!body && looksLikeDraftBody(message)) {
      body = message.trim();
    }

    if (!body) {
      await this.sessionPreferences.setWritingDeskPending(sessionId, {
        type: 'writing_desk_awaiting_body',
        title: title !== 'Untitled draft' ? title : undefined,
        tone,
        draftId,
        createdAt: Date.now(),
      });
      return toolText(
        `I can save that to your Writing desk — paste the text (and a title if you like), or open **Writing desk** in the sidebar to create a draft.`,
      );
    }

    await this.sessionPreferences
      .clearWritingDeskPending(sessionId)
      .catch(() => undefined);

    if (draftId) {
      const updated = await this.writingDesk.updateDraft(sessionId, draftId, {
        title,
        body,
        tone,
      });
      if (!updated) {
        return toolText(
          `I couldn't find that draft. Open Writing desk to pick one, or tell me a new title and text to save.`,
        );
      }
      return toolOk(
        `Updated **${updated.title}** on your Writing desk.\n\nOpen Writing desk anytime to keep editing or copy it.`,
        {
          kind: 'writing_draft_saved',
          title: 'Draft updated',
          detail: updated.title,
        },
      );
    }

    const created = await this.writingDesk.createDraft(sessionId, {
      title,
      body,
      tone,
    });

    return toolOk(
      `Saved **${created.title}** to your Writing desk.\n\nOpen Writing desk in the sidebar to revise, copy, or keep working on it later.`,
      {
        kind: 'writing_draft_saved',
        title: 'Draft saved',
        detail: created.title,
      },
    );
  }

  async handleList(sessionId: string): Promise<ToolReplyInput> {
    const drafts = await this.writingDesk.listDrafts(sessionId);
    if (drafts.length === 0) {
      return toolText(
        `Your Writing desk is empty so far. When we draft something you like, say “save this to my writing desk” — or open Writing desk and start a new piece.`,
      );
    }

    const lines = drafts.slice(0, 8).map((d) => {
      const tone = d.tone ? ` · ${d.tone}` : '';
      return `- **${d.title}**${tone} — ${d.preview}`;
    });

    return toolText(
      `Here's what's on your Writing desk:\n\n${lines.join('\n')}\n\nOpen **Writing desk** in the sidebar to edit or copy any of these.`,
    );
  }
}

export function looksLikeDraftBody(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < MIN_INLINE_BODY_CHARS) {
    return false;
  }
  // Short save/list commands should not be treated as the draft itself.
  if (
    /^(can you |please )?(add|save|put|show|list|open)\b[\s\S]{0,80}\b(writing desk|drafts?)\b/i.test(
      trimmed,
    ) &&
    trimmed.length < 160
  ) {
    return false;
  }
  return true;
}

function slotString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slotId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.floor(n);
}
