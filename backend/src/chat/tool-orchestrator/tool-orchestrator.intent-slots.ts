import { DateTime } from 'luxon';
import type { IntentEnvelope } from '../intent/intent.types';
import type { CalendarListMode } from './tool-orchestrator.types';

/**
 * Reads Stage-1 `IntentEnvelope.slots` with simple validation.
 */
export function getSlotString(
  envelope: IntentEnvelope | undefined,
  key: string,
): string | null {
  const v = envelope?.slots?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function getSlotNumber(
  envelope: IntentEnvelope | undefined,
  key: string,
): number | null {
  const v = envelope?.slots?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function getSlotListMode(
  envelope: IntentEnvelope | undefined,
): CalendarListMode {
  const mode = getSlotString(envelope, 'mode');
  const valid: CalendarListMode[] = [
    'week',
    'month',
    'year',
    'day',
    'next_days',
    'upcoming',
    'past',
  ];
  return mode && (valid as string[]).includes(mode)
    ? (mode as CalendarListMode)
    : 'upcoming';
}

export function getSlotTimeZone(
  envelope: IntentEnvelope | undefined,
): string | null {
  const tz = getSlotString(envelope, 'timeZone');
  if (!tz) return null;
  return DateTime.now().setZone(tz).isValid ? tz : null;
}

export function getSlotSelectedIndex(
  envelope: IntentEnvelope | undefined,
  max: number,
): number | null {
  const raw = getSlotNumber(envelope, 'selectedIndex');
  if (raw === null) return null;
  const idx = Math.trunc(raw);
  if (idx < 1 || idx > max) return null;
  return idx;
}
