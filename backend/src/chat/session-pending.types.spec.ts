import { parsePendingDocument } from './session-pending.types';

describe('parsePendingDocument', () => {
  it('migrates legacy web-search-only pending blobs', () => {
    const doc = parsePendingDocument({
      type: 'web_search_missing_location',
      message: 'coffee near me',
      envelope: { intent: 'web_search' },
    });

    expect(doc.webSearch?.type).toBe('web_search_missing_location');
    expect(doc.tools).toEqual({});
  });

  it('reads version-1 unified documents', () => {
    const doc = parsePendingDocument({
      version: 1,
      webSearch: null,
      tools: {
        email_draft: {
          actionType: 'email_draft',
          originalMessage: 'email jane',
          payload: {},
          missingSlots: ['recipientEmail'],
          collectedSlots: {},
          createdAt: 1,
          expiresAt: 2,
        },
      },
    });

    expect(doc.tools?.email_draft?.actionType).toBe('email_draft');
  });
});
