import { isGeolocationSupported } from '@/lib/browser-location';
import {
  SESSION_TONE_PRESETS,
  type SessionTone,
} from '@/lib/session-prefs';

const TONE_LABELS: Record<SessionTone, string> = {
  warm: 'Warm & professional',
  concise: 'Concise',
  casual: 'Casual',
};

const fieldClass =
  'mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/50';

type Props = {
  tone: SessionTone;
  location: string;
  timeZone: string;
  meetingMinutes: string;
  autoLocation: boolean;
  detectingLocation: boolean;
  disabled: boolean;
  onToneChange: (tone: SessionTone) => void;
  onLocationChange: (value: string) => void;
  onTimeZoneChange: (value: string) => void;
  onMeetingMinutesChange: (value: string) => void;
  onAutoLocationChange: (value: boolean) => void;
  onDetectLocation: () => void;
};

export function SettingsForm({
  tone,
  location,
  timeZone,
  meetingMinutes,
  autoLocation,
  detectingLocation,
  disabled,
  onToneChange,
  onLocationChange,
  onTimeZoneChange,
  onMeetingMinutesChange,
  onAutoLocationChange,
  onDetectLocation,
}: Props) {
  const geolocationSupported = isGeolocationSupported();

  return (
    <div className="space-y-4">
      <label className="block text-left">
        <span className="text-xs font-medium text-ink-muted">Reply tone</span>
        <select
          className={fieldClass}
          value={tone}
          disabled={disabled}
          onChange={(e) => onToneChange(e.target.value as SessionTone)}
        >
          {SESSION_TONE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {TONE_LABELS[preset]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-left">
        <span className="text-xs font-medium text-ink-muted">City</span>
        <input
          type="text"
          className={fieldClass}
          value={location}
          disabled={disabled}
          placeholder="e.g. Austin"
          onChange={(e) => onLocationChange(e.target.value)}
        />
        <span className="mt-1 block text-[11px] text-ink-muted">
          Used for “near me” search and morning weather.
        </span>
      </label>

      {geolocationSupported ? (
        <div className="space-y-2 text-left">
          <button
            type="button"
            disabled={disabled || detectingLocation}
            onClick={onDetectLocation}
            className="cursor-pointer rounded-[var(--radius-sm)] border border-border bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {detectingLocation ? 'Finding your city…' : 'Use my current location'}
          </button>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer"
              checked={autoLocation}
              disabled={disabled}
              onChange={(e) => onAutoLocationChange(e.target.checked)}
            />
            <span className="text-[11px] text-ink-muted">
              Keep my city updated from this device. Only works after you’ve
              allowed location in your browser, and only the city is saved,
              never exact coordinates. Typing a different city above turns
              this off.
            </span>
          </label>
        </div>
      ) : null}

      <label className="block text-left">
        <span className="text-xs font-medium text-ink-muted">Timezone</span>
        <input
          type="text"
          className={fieldClass}
          value={timeZone}
          disabled={disabled}
          placeholder="America/Chicago"
          onChange={(e) => onTimeZoneChange(e.target.value)}
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
          disabled={disabled}
          onChange={(e) => onMeetingMinutesChange(e.target.value)}
        />
        <span className="mt-1 block text-[11px] text-ink-muted">
          Used when you schedule an event without an end time.
        </span>
      </label>
    </div>
  );
}
