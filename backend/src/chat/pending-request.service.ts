import { Injectable } from '@nestjs/common';
import { SessionPreferencesService } from './session-preferences.service';
import type {
  PendingActionType,
  PendingRequest,
  ToolPendingMap,
} from './session-pending.types';

export type {
  PendingActionType,
  PendingRequest,
  PendingSlotName,
} from './session-pending.types';

/**
 * Durable pending-intent store keyed by session + action type.
 * Persisted in `session_preferences.pending_action.tools` so multi-turn
 * calendar/email flows survive process restarts.
 */
@Injectable()
export class PendingRequestService {
  constructor(
    private readonly sessionPreferences: SessionPreferencesService,
  ) { }

  async setPending<TPayload>(
    sessionId: string,
    pending: Omit<PendingRequest<TPayload>, 'createdAt' | 'expiresAt'> & {
      ttlMs?: number;
    },
  ): Promise<void> {
    const sid = sessionId.trim();
    if (!sid) return;

    const now = Date.now();
    const ttlMs = pending.ttlMs ?? 30 * 60 * 1000;
    const next: PendingRequest<TPayload> = {
      actionType: pending.actionType,
      originalMessage: pending.originalMessage,
      payload: pending.payload,
      missingSlots: pending.missingSlots,
      collectedSlots: pending.collectedSlots,
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    const tools = await this.loadActiveTools(sid);
    tools[next.actionType] = next as PendingRequest<unknown>;
    await this.sessionPreferences.saveToolPendingMap(sid, tools);
  }

  async getPending<TPayload>(
    sessionId: string,
    actionType: PendingActionType,
  ): Promise<PendingRequest<TPayload> | null> {
    const sid = sessionId.trim();
    if (!sid) return null;

    const tools = await this.loadActiveTools(sid);
    const value = tools[actionType];
    if (!value) return null;
    return value as PendingRequest<TPayload>;
  }

  async clearPending(
    sessionId: string,
    actionType: PendingActionType,
  ): Promise<void> {
    const sid = sessionId.trim();
    if (!sid) return;

    const tools = await this.loadActiveTools(sid);
    if (!(actionType in tools)) return;
    delete tools[actionType];
    await this.sessionPreferences.saveToolPendingMap(sid, tools);
  }

  async hasAny(
    sessionId: string,
    actionTypes: PendingActionType[],
  ): Promise<boolean> {
    const tools = await this.loadActiveTools(sessionId);
    return actionTypes.some((actionType) => Boolean(tools[actionType]));
  }

  private async loadActiveTools(sessionId: string): Promise<ToolPendingMap> {
    const tools = await this.sessionPreferences.getToolPendingMap(sessionId);
    const now = Date.now();
    let changed = false;

    for (const actionType of Object.keys(tools) as PendingActionType[]) {
      const pending = tools[actionType];
      if (!pending || pending.expiresAt <= now) {
        delete tools[actionType];
        changed = true;
      }
    }

    if (changed) {
      await this.sessionPreferences.saveToolPendingMap(sessionId, tools);
    }

    return tools;
  }
}
