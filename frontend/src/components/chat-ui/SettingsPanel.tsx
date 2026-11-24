'use client';

import { SuccessToast } from './SuccessToast';
import { SettingsForm } from './settings/SettingsForm';
import { useSettingsPanel } from './settings/useSettingsPanel';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionReady: boolean;
};

export function SettingsPanel({ open, onClose, sessionReady }: Props) {
  const {
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
  } = useSettingsPanel(open, sessionReady);

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
        className="absolute inset-0 bg-black/65 backdrop-blur-[1px]"
        aria-label="Close settings"
        onClick={onClose}
      />

      {savedFlash ? (
        <SuccessToast
          message="Settings saved."
          onDismiss={clearSavedFlash}
          zClassName="z-[70]"
        />
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
            <SettingsForm
              tone={tone}
              location={location}
              timeZone={timeZone}
              meetingMinutes={meetingMinutes}
              autoLocation={autoLocation}
              detectingLocation={detectingLocation}
              disabled={saving}
              onToneChange={setTone}
              onLocationChange={setLocation}
              onAutoLocationChange={setAutoLocation}
              onDetectLocation={() => void detectLocationNow()}
              onTimeZoneChange={setTimeZone}
              onMeetingMinutesChange={setMeetingMinutes}
            />
          )}
        </div>

        <footer className="shrink-0 border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="w-full cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 py-2.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
