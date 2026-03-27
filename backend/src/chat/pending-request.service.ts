import { Injectable } from '@nestjs/common';

export type PendingActionType =
  | 'calendar_create'
  | 'calendar_list'
  | 'email_send';

export type PendingSlotName =
  | 'timeZone'
  | 'confirmation'
  | 'calendarId'
  | 'recipient'
  | 'targetEvent';

export type PendingRequest<TPayload> = {
  actionType: PendingActionType;
  originalMessage: string;
  payload: TPayload;
  missingSlots: PendingSlotName[];
  collectedSlots: Partial<Record<PendingSlotName, string>>;
  createdAt: number;
  expiresAt: number;
};

/**
 * In-memory pending-intent store keyed by session.
 * Multiple pending actions can coexist per session (one per action type).
 */
@Injectable()
export class PendingRequestService {
  private readonly bySession = new Map<
    string,
    Map<PendingActionType, PendingRequest<unknown>>
  >();

  setPending<TPayload>(
    sessionId: string,
    pending: Omit<PendingRequest<TPayload>, 'createdAt' | 'expiresAt'> & {
      ttlMs?: number;
    },
  ): void {
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

    const existing = this.bySession.get(sid) ?? new Map();
    existing.set(next.actionType, next as PendingRequest<unknown>);
    this.bySession.set(sid, existing);
  }

  getPending<TPayload>(
    sessionId: string,
    actionType: PendingActionType,
  ): PendingRequest<TPayload> | null {
    const sid = sessionId.trim();
    if (!sid) return null;
    this.gcExpiredForSession(sid);

    const byAction = this.bySession.get(sid);
    const value = byAction?.get(actionType);
    if (!value) return null;
    return value as PendingRequest<TPayload>;
  }

  clearPending(sessionId: string, actionType: PendingActionType): void {
    const sid = sessionId.trim();
    if (!sid) return;
    const byAction = this.bySession.get(sid);
    if (!byAction) return;
    byAction.delete(actionType);
    if (byAction.size === 0) {
      this.bySession.delete(sid);
    }
  }

  private gcExpiredForSession(sessionId: string): void {
    const byAction = this.bySession.get(sessionId);
    if (!byAction) return;
    const now = Date.now();
    for (const [actionType, pending] of byAction.entries()) {
      if (pending.expiresAt <= now) {
        byAction.delete(actionType);
      }
    }
    if (byAction.size === 0) {
      this.bySession.delete(sessionId);
    }
  }
}
