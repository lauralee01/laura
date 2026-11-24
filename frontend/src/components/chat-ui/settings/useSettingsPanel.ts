'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  describeLocationError,
  detectBrowserLocation,
  isAutoLocationEnabled,
  setAutoLocationEnabled,
} from '@/lib/browser-location';
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
  const [autoLocation, setAutoLocation] = useState(true);
  const [loadedAutoLocation, setLoadedAutoLocation] = useState(true);
  const [detectingLocation, setDetectingLocation] = useState(false);
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
      const auto = isAutoLocationEnabled();
      setAutoLocation(auto);
      setLoadedAutoLocation(auto);
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

  /** Asks the browser for the current city and fills the Home city field. */
  const detectLocationNow = useCallback(async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const city = await detectBrowserLocation();
      setLocation(city);
      // The backend already stored it, so treat it as the saved value:
      // saving must not read this as a manual edit.
      setPrefs((current) => (current ? { ...current, location: city } : current));
      // They just opted in to device location, so keep it fresh.
      setAutoLocation(true);
    } catch (err: unknown) {
      setError(describeLocationError(err));
    } finally {
      setDetectingLocation(false);
    }
  }, []);

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
      const trimmedLocation = location.trim();
      const next = await patchSessionPrefs({
        tone,
        timeZone: timeZone.trim(),
        location: trimmedLocation ? trimmedLocation : null,
        defaultMeetingMinutes: Math.round(minutes),
      });

      /*
       * Typing a different city means "use this one": switch off the quiet
       * device refresh so it doesn't overwrite it on the next page load
       * (unless they explicitly changed the toggle in the same save).
       */
      const locationEdited =
        trimmedLocation !== (prefs?.location ?? '').trim();
      const nextAuto =
        locationEdited &&
        trimmedLocation &&
        autoLocation === loadedAutoLocation
          ? false
          : autoLocation;
      setAutoLocationEnabled(nextAuto);
      setAutoLocation(nextAuto);
      setLoadedAutoLocation(nextAuto);

      applyPrefs(next);
      setSavedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save settings.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    meetingMinutes,
    timeZone,
    tone,
    location,
    prefs,
    autoLocation,
    loadedAutoLocation,
    applyPrefs,
  ]);

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
    autoLocation,
    setAutoLocation,
    detectingLocation,
    detectLocationNow,
    loading,
    saving,
    error,
    savedFlash,
    clearSavedFlash,
    save,
  };
}
