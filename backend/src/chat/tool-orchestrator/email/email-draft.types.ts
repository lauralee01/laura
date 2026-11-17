export type PendingEmailDraftPayload = {
  recipients?: string[];
  recipientName?: string;
  subject?: string;
  context?: string;
  tone?: string;
};

export type CreateGmailDraftArgs = {
  recipients: string[];
  subject?: string;
  context: string;
  tone?: string;
  recipientName?: string;
};
