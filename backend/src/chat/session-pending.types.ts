export type PendingActionType =
  | 'calendar_create'
  | 'calendar_list'
  | 'calendar_delete'
  | 'calendar_update'
  | 'calendar_mutate_tz'
  | 'email_draft'
  | 'email_send';

export type PendingSlotName =
  | 'timeZone'
  | 'title'
  | 'timeRange'
  | 'confirmation'
  | 'calendarId'
  | 'recipient'
  | 'recipientEmail'
  | 'subject'
  | 'body'
  | 'targetEvent'
  | 'updateDetails';

export type PendingRequest<TPayload> = {
  actionType: PendingActionType;
  originalMessage: string;
  payload: TPayload;
  missingSlots: PendingSlotName[];
  collectedSlots: Partial<Record<PendingSlotName, string>>;
  createdAt: number;
  expiresAt: number;
};

export type WebSearchMissingLocationPending = {
  type: 'web_search_missing_location';
  message: string;
  envelope?: {
    intent?: string;
    slots?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type ToolPendingMap = Partial<
  Record<PendingActionType, PendingRequest<unknown>>
>;

/**
 * Most recent Gmail draft Laura created in this session.
 * Survives send-cancel so a later "delete the draft" can still call Gmail.
 */
export type LastEmailDraft = {
  draftId: string;
  recipients: string[];
  subject: string;
  body: string;
  updatedAt: number;
};

/**
 * Unified `session_preferences.pending_action` document.
 * Replaces the old single web-search-only JSON blob and the in-memory tool map.
 */
export type SessionPendingDocument = {
  version: 1;
  webSearch?: WebSearchMissingLocationPending | null;
  tools?: ToolPendingMap;
  lastEmailDraft?: LastEmailDraft | null;
};

export function emptyPendingDocument(): SessionPendingDocument {
  return { version: 1, webSearch: null, tools: {}, lastEmailDraft: null };
}

export function parsePendingDocument(raw: unknown): SessionPendingDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyPendingDocument();
  }

  const obj = raw as Record<string, unknown>;

  /*
   * Legacy shape from before tool pending moved into this document.
   */
  if (obj['type'] === 'web_search_missing_location') {
    return {
      version: 1,
      webSearch: obj as unknown as WebSearchMissingLocationPending,
      tools: {},
    };
  }

  if (obj['version'] === 1) {
    const tools =
      obj['tools'] &&
      typeof obj['tools'] === 'object' &&
      !Array.isArray(obj['tools'])
        ? (obj['tools'] as ToolPendingMap)
        : {};

    const webSearch =
      obj['webSearch'] && typeof obj['webSearch'] === 'object'
        ? (obj['webSearch'] as WebSearchMissingLocationPending)
        : null;

    const lastEmailDraft = parseLastEmailDraft(obj['lastEmailDraft']);

    return { version: 1, webSearch, tools, lastEmailDraft };
  }

  return emptyPendingDocument();
}

function parseLastEmailDraft(raw: unknown): LastEmailDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const draftId =
    typeof obj.draftId === 'string' ? obj.draftId.trim() : '';
  if (!draftId) return null;

  const recipients = Array.isArray(obj.recipients)
    ? obj.recipients.filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      )
    : [];
  const subject =
    typeof obj.subject === 'string' ? obj.subject : '';
  const body = typeof obj.body === 'string' ? obj.body : '';
  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : Date.now();

  return { draftId, recipients, subject, body, updatedAt };
}
