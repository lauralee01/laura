'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSessionPrefs,
  patchSessionPrefs,
  SESSION_TONE_PRESETS,
  type SessionPrefs,
  type SessionTone,
} from '@/lib/session-prefs';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionReady: boolean;
};

const TONE_LABELS: Record<SessionTone, string> = {
  warm: 'Warm & professional',
  concise: 'Concise',
  casual: 'Casual',
};

const fieldClass =
  'mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/50';

export function SettingsPanel({ open, onClose, sessionReady }: Props) {
  const [prefs, setPrefs] = useState<SessionPrefs | null>(null);
  const [tone, setTone] = useState<SessionTone>('warm');
  const [location, setLocation] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [meetingMinutes, setMeetingMinutes] = useState('60');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSessionPrefs();
      setPrefs(next);
      setTone(next.tone);
      setLocation(next.location ?? '');
      setTimeZone(next.timeZone ?? '');
      setMeetingMinutes(String(next.defaultMeetingMinutes));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not load settings.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionReady]);

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
    const id = window.setTimeout(() => setSavedFlash(false), 4000);
    return () => window.clearTimeout(id);
  }, [savedFlash]);

  const save = async () => {
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
      setPrefs(next);
      setTone(next.tone);
      setLocation(next.location ?? '');
      setTimeZone(next.timeZone ?? '');
      setMeetingMinutes(String(next.defaultMeetingMinutes));
      setSavedFlash(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
        aria-label="Close settings"
        onClick={onClose}
      />

      {savedFlash ? (
        <div
          role="status"
          className="fixed top-4 left-1/2 z-[70] max-w-md -translate-x-1/2 rounded-[var(--radius-lg)] border border-success/30 bg-success-soft px-4 py-3 text-sm shadow-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="leading-snug text-ink">Settings saved.</p>
            <button
              type="button"
              onClick={() => setSavedFlash(false)}
              className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <aside className="relative flex h-full w-full max-w-[24rem] flex-col border-l border-border-subtle bg-surface shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="min-w-0">
            <h2
              id="settings-panel-title"
              className="text-sm font-semibold text-ink"
            >
              Settings
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Defaults for this Laura session
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="mb-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          {loading && !prefs ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-left">
                <span className="text-xs font-medium text-ink-muted">
                  Reply tone
                </span>
                <select
                  className={fieldClass}
                  value={tone}
                  disabled={saving}
                  onChange={(e) => setTone(e.target.value as SessionTone)}
                >
                  {SESSION_TONE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {TONE_LABELS[preset]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-left">
                <span className="text-xs font-medium text-ink-muted">
                  Home city
                </span>
                <input
                  type="text"
                  className={fieldClass}
                  value={location}
                  disabled={saving}
                  placeholder="e.g. Austin"
                  onChange={(e) => setLocation(e.target.value)}
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Used for “near me” search and morning weather.
                </span>
              </label>

              <label className="block text-left">
                <span className="text-xs font-medium text-ink-muted">
                  Timezone
                </span>
                <input
                  type="text"
                  className={fieldClass}
                  value={timeZone}
                  disabled={saving}
                  placeholder="America/Chicago"
                  onChange={(e) => setTimeZone(e.target.value)}
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  IANA name (calendar and local time).
                </span>
              </label>

              <label className="block text-left">
                <span className="text-xs font-medium text-ink-muted">
                  Default meeting length (minutes)
                </span>
                <input
                  type="number"
                  min={15}
                  max={180}
                  step={5}
                  className={fieldClass}
                  value={meetingMinutes}
                  disabled={saving}
                  onChange={(e) => setMeetingMinutes(e.target.value)}
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Used when you schedule an event without an end time.
                </span>
              </label>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="w-full rounded-[var(--radius-md)] bg-accent px-3 py-2.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
