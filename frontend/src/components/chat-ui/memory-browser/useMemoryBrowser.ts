'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteMemory,
  listMemories,
  updateMemory,
  type MemoryItem,
} from '@/lib/memory-api';

/**
 * Use Memory Browser
 */

function useAutoClearFlash(active: boolean, clear: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setTimeout(clear, 4000);
    return () => window.clearTimeout(id);
  }, [active, clear]);
}

export function useMemoryBrowser(open: boolean, sessionReady: boolean) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editSavedFlash, setEditSavedFlash] = useState(false);
  const [deleteSavedFlash, setDeleteSavedFlash] = useState(false);

  const clearEditFlash = useCallback(() => setEditSavedFlash(false), []);
  const clearDeleteFlash = useCallback(() => setDeleteSavedFlash(false), []);
  useAutoClearFlash(editSavedFlash, clearEditFlash);
  useAutoClearFlash(deleteSavedFlash, clearDeleteFlash);

  const load = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMemories(await listMemories());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not load memories.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditDraft('');
      setDeleteTarget(null);
      setError(null);
      setEditSavedFlash(false);
      setDeleteSavedFlash(false);
      return;
    }
    void load();
  }, [open, load]);

  const startEdit = useCallback((item: MemoryItem) => {
    setEditingId(item.id);
    setEditDraft(item.content);
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) {
      return;
    }
    const content = editDraft.trim();
    if (!content) {
      setError('Memory text cannot be empty.');
      return;
    }

    setSavingId(editingId);
    setError(null);
    setEditSavedFlash(false);
    try {
      const updated = await updateMemory(editingId, content);
      setMemories((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      setEditingId(null);
      setEditDraft('');
      setEditSavedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save memory.',
      );
    } finally {
      setSavingId(null);
    }
  }, [editingId, editDraft]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    setError(null);
    setDeleteSavedFlash(false);
    try {
      await deleteMemory(deleteTarget.id);
      setMemories((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) {
        setEditingId(null);
        setEditDraft('');
      }
      setDeleteTarget(null);
      setDeleteSavedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not delete memory.',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, editingId]);

  return {
    memories,
    loading,
    error,
    editingId,
    editDraft,
    setEditDraft,
    savingId,
    deleteTarget,
    setDeleteTarget,
    deleting,
    editSavedFlash,
    deleteSavedFlash,
    clearEditFlash,
    clearDeleteFlash,
    startEdit,
    cancelEdit,
    saveEdit,
    confirmDelete,
  };
}
