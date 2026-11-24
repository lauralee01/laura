'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSessionPrefs,
  patchSessionPrefs,
  type SessionPrefs,
  type SessionTone,
} from '@/lib/session-prefs';

export function useSettingsPanel(open: boolean, sessionReady: boolean) {
  const [prefs, setPrefs] = useState<SessionPrefs | null>(null);
  const [tone, setTone] = useState<SessionTone>('warm');
  const [location, setLocation] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [meetingMinutes, setMeetingMinutes] = useState('60');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const clearSavedFlash = useCallback(() => setSavedFlash(false), []);

  const applyPrefs = useCallback((next: SessionPrefs) => {
    setPrefs(next);
    setTone(next.tone);
    setLocation(next.location ?? '');
    setTimeZone(next.timeZone ?? '');
    setMeetingMinutes(String(next.defaultMeetingMinutes));
  }, []);

  const load = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      applyPrefs(await fetchSessionPrefs());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not load settings.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionReady, applyPrefs]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSavedFlash(false);
      return;
    }
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!savedFlash) {
      return;
    }
    const id = window.setTimeout(clearSavedFlash, 4000);
    return () => window.clearTimeout(id);
  }, [savedFlash, clearSavedFlash]);

  const save = useCallback(async () => {
    const minutes = Number(meetingMinutes);
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 180) {
      setError('Meeting length must be between 15 and 180 minutes.');
      return;
    }
    if (!timeZone.trim()) {
      setError('Timezone is required (IANA, e.g. America/Chicago).');
      return;
    }

    setSaving(true);
    setError(null);
    setSavedFlash(false);
    try {
      const next = await patchSessionPrefs({
        tone,
        timeZone: timeZone.trim(),
        location: location.trim() ? location.trim() : null,
        defaultMeetingMinutes: Math.round(minutes),
      });
      applyPrefs(next);
      setSavedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save settings.',
      );
    } finally {
      setSaving(false);
    }
  }, [meetingMinutes, timeZone, tone, location, applyPrefs]);

  return {
    prefs,
    tone,
    setTone,
    location,
    setLocation,
    timeZone,
    setTimeZone,
    meetingMinutes,
    setMeetingMinutes,
    loading,
    saving,
    error,
    savedFlash,
    clearSavedFlash,
    save,
  };
}
