import {
  buildPendingHintFromSnapshot,
  hasCalendarPending,
  pendingActionsInterruptedByIntent,
  shouldClearWebSearchLocationPending,
  shouldResumeWebSearchLocation,
} from './pending-policy';
import type { ToolPendingMap } from './session-pending.types';

function toolsWith(
  partial: ToolPendingMap,
): ToolPendingMap {
  return partial;
}

describe('pending-policy', () => {
  it('clears calendar pending when Stage-1 switches to web_search', () => {
    const tools = toolsWith({
      calendar_delete: {
        actionType: 'calendar_delete',
        originalMessage: 'delete dentist',
        payload: {},
        missingSlots: ['confirmation'],
        collectedSlots: {},
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(
      pendingActionsInterruptedByIntent(tools, 'web_search'),
    ).toEqual(['calendar_delete']);
  });

  it('keeps email_send pending for email_send_confirm', () => {
    const tools = toolsWith({
      email_send: {
        actionType: 'email_send',
        originalMessage: 'send it',
        payload: {},
        missingSlots: ['confirmation'],
        collectedSlots: {},
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(
      pendingActionsInterruptedByIntent(tools, 'email_send_confirm'),
    ).toEqual([]);
  });

  it('does not interrupt on pending_confirm / pending_cancel', () => {
    const tools = toolsWith({
      calendar_delete: {
        actionType: 'calendar_delete',
        originalMessage: 'delete',
        payload: {},
        missingSlots: ['confirmation'],
        collectedSlots: {},
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(
      pendingActionsInterruptedByIntent(tools, 'pending_confirm'),
    ).toEqual([]);
    expect(
      pendingActionsInterruptedByIntent(tools, 'pending_cancel'),
    ).toEqual([]);
  });

  it('resumes web-search location for chat answers but clears for calendar', () => {
    expect(shouldResumeWebSearchLocation('general_chat')).toBe(true);
    expect(shouldResumeWebSearchLocation('clarify')).toBe(true);
    expect(shouldClearWebSearchLocationPending('calendar_list')).toBe(true);
    expect(shouldResumeWebSearchLocation('calendar_list')).toBe(false);
    expect(shouldClearWebSearchLocationPending('current_datetime')).toBe(
      true,
    );
  });

  it('builds a single hint from one snapshot', () => {
    const hint = buildPendingHintFromSnapshot({
      tools: {
        email_draft: {
          actionType: 'email_draft',
          originalMessage: 'email jane',
          payload: {},
          missingSlots: ['recipientEmail'],
          collectedSlots: {},
          createdAt: 1,
          expiresAt: Date.now() + 60_000,
        },
      },
      webSearch: {
        type: 'web_search_missing_location',
        message: 'coffee near me',
      },
    });

    expect(hint).toContain('web search waiting');
    expect(hint).toContain('email draft');
  });

  it('detects calendar pending from the map', () => {
    expect(hasCalendarPending({})).toBe(false);
    expect(
      hasCalendarPending({
        calendar_list: {
          actionType: 'calendar_list',
          originalMessage: 'list',
          payload: {},
          missingSlots: ['timeZone'],
          collectedSlots: {},
          createdAt: 1,
          expiresAt: Date.now() + 60_000,
        },
      }),
    ).toBe(true);
  });
});
