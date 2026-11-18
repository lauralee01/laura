import {
  SESSION_TONE_PRESETS,
  type SessionTone,
} from '@/lib/session-prefs';
import { isUsTimeZone, US_TIMEZONES } from './us-timezones';

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
  disabled: boolean;
  onToneChange: (tone: SessionTone) => void;
  onLocationChange: (value: string) => void;
  onTimeZoneChange: (value: string) => void;
  onMeetingMinutesChange: (value: string) => void;
};

export function SettingsForm({
  tone,
  location,
  timeZone,
  meetingMinutes,
  disabled,
  onToneChange,
  onLocationChange,
  onTimeZoneChange,
  onMeetingMinutesChange,
}: Props) {
  const knownUsZone = isUsTimeZone(timeZone);

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
        <span className="text-xs font-medium text-ink-muted">Home city</span>
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

      <label className="block text-left">
        <span className="text-xs font-medium text-ink-muted">Timezone</span>
        <select
          className={fieldClass}
          value={timeZone}
          disabled={disabled}
          onChange={(e) => onTimeZoneChange(e.target.value)}
        >
          {!timeZone ? (
            <option value="" disabled>
              Select a timezone
            </option>
          ) : null}
          {!knownUsZone && timeZone ? (
            <option value={timeZone}>{timeZone} (current)</option>
          ) : null}
          {US_TIMEZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-ink-muted">
          Used for calendar and local time. US zones for now.
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
