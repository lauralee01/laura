export type WritingDraftVersion = {
  body: string;
  tone: string | null;
  savedAt: string;
};

export type WritingDraft = {
  id: number;
  title: string;
  body: string;
  tone: string | null;
  versions: WritingDraftVersion[];
  createdAt: string;
  updatedAt: string;
};

export type WritingDraftSummary = {
  id: number;
  title: string;
  tone: string | null;
  preview: string;
  updatedAt: string;
};

export const MAX_WRITING_DRAFT_VERSIONS = 10;
