'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createWritingDraft,
  deleteWritingDraft,
  getWritingDraft,
  listWritingDrafts,
  updateWritingDraft,
  type WritingDraft,
  type WritingDraftSummary,
} from '@/lib/writing-desk-api';

function useAutoClearFlash(active: boolean, clear: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setTimeout(clear, 4000);
    return () => window.clearTimeout(id);
  }, [active, clear]);
}

export function useWritingDesk(open: boolean, sessionReady: boolean) {
  const [drafts, setDrafts] = useState<WritingDraftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [editorTone, setEditorTone] = useState('');
  const [versionCount, setVersionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<WritingDraftSummary | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deletedFlash, setDeletedFlash] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const clearSavedFlash = useCallback(() => setSavedFlash(false), []);
  const clearDeletedFlash = useCallback(() => setDeletedFlash(false), []);
  const clearCopiedFlash = useCallback(() => setCopiedFlash(false), []);
  useAutoClearFlash(savedFlash, clearSavedFlash);
  useAutoClearFlash(deletedFlash, clearDeletedFlash);
  useAutoClearFlash(copiedFlash, clearCopiedFlash);

  const load = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDrafts(await listWritingDrafts());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not load writing desk.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setEditorTitle('');
      setEditorBody('');
      setEditorTone('');
      setVersionCount(0);
      setDeleteTarget(null);
      setError(null);
      setIsCreating(false);
      setSavedFlash(false);
      setDeletedFlash(false);
      setCopiedFlash(false);
      return;
    }
    void load();
  }, [open, load]);

  const applyDraft = useCallback((draft: WritingDraft) => {
    setSelectedId(draft.id);
    setEditorTitle(draft.title);
    setEditorBody(draft.body);
    setEditorTone(draft.tone ?? '');
    setVersionCount(draft.versions.length);
    setIsCreating(false);
  }, []);

  const startCreate = useCallback(() => {
    setSelectedId(null);
    setEditorTitle('');
    setEditorBody('');
    setEditorTone('');
    setVersionCount(0);
    setIsCreating(true);
    setError(null);
  }, []);

  const openDraft = useCallback(
    async (id: number) => {
      setError(null);
      setIsCreating(false);
      try {
        const draft = await getWritingDraft(id);
        applyDraft(draft);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Could not open draft.',
        );
      }
    },
    [applyDraft],
  );

  const backToList = useCallback(() => {
    setSelectedId(null);
    setIsCreating(false);
    setEditorTitle('');
    setEditorBody('');
    setEditorTone('');
    setVersionCount(0);
  }, []);

  const saveDraft = useCallback(async () => {
    const title = editorTitle.trim() || 'Untitled draft';
    const body = editorBody.trim();
    if (!body) {
      setError('Draft text cannot be empty.');
      return;
    }

    setSaving(true);
    setError(null);
    setSavedFlash(false);
    try {
      const tone = editorTone.trim() || null;
      if (isCreating || selectedId === null) {
        const created = await createWritingDraft({ title, body, tone });
        applyDraft(created);
        setDrafts(await listWritingDrafts());
      } else {
        const updated = await updateWritingDraft(selectedId, {
          title,
          body,
          tone,
        });
        applyDraft(updated);
        setDrafts(await listWritingDrafts());
      }
      setSavedFlash(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setSaving(false);
    }
  }, [
    applyDraft,
    editorBody,
    editorTitle,
    editorTone,
    isCreating,
    selectedId,
  ]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteWritingDraft(deleteTarget.id);
      setDrafts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id || isCreating) {
        backToList();
      }
      setDeleteTarget(null);
      setDeletedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not delete draft.',
      );
    } finally {
      setDeleting(false);
    }
  }, [backToList, deleteTarget, isCreating, selectedId]);

  const copyBody = useCallback(async () => {
    const text = editorBody.trim();
    if (!text) {
      setError('Nothing to copy yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFlash(true);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [editorBody]);

  const editing = isCreating || selectedId !== null;

  return {
    drafts,
    loading,
    error,
    editing,
    isCreating,
    selectedId,
    editorTitle,
    setEditorTitle,
    editorBody,
    setEditorBody,
    editorTone,
    setEditorTone,
    versionCount,
    saving,
    deleting,
    deleteTarget,
    setDeleteTarget,
    savedFlash,
    deletedFlash,
    copiedFlash,
    clearSavedFlash,
    clearDeletedFlash,
    clearCopiedFlash,
    startCreate,
    openDraft,
    backToList,
    saveDraft,
    confirmDelete,
    copyBody,
  };
}
