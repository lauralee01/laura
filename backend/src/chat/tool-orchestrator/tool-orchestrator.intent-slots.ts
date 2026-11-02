import { DateTime } from 'luxon';
import type { IntentEnvelope } from '../intent/intent.types';
import type { CalendarListMode } from './tool-orchestrator.types';

const CALENDAR_LIST_MODES = new Set<CalendarListMode>([
  'week',
  'month',
  'year',
  'day',
  'next_days',
  'upcoming',
  'past',
]);

const DEFAULT_CALENDAR_LIST_MODE: CalendarListMode = 'upcoming';

function isCalendarListMode(
  value: string,
): value is CalendarListMode {
  return CALENDAR_LIST_MODES.has(value as CalendarListMode);
}

/**
 * Reads a non-empty string from Stage-1 IntentEnvelope slots.
 */
export function getSlotString(
  envelope: IntentEnvelope | undefined,
  key: string,
): string | null {
  const value = envelope?.slots?.[key];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

/**
 * Reads a finite number from Stage-1 IntentEnvelope slots.
 */
export function getSlotNumber(
  envelope: IntentEnvelope | undefined,
  key: string,
): number | null {
  const value = envelope?.slots?.[key];

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
}

/**
 * Returns a supported calendar-list mode.
 *
 * Accepts flat slots (`mode` + offsets) and also nested shapes the classifier
 * sometimes emits from prompt examples (`slots.day = { mode, dayOffset }`).
 * Infers mode from offset fields when `mode` is missing so "today" does not
 * silently fall through to upcoming.
 */
export function getSlotListMode(
  envelope: IntentEnvelope | undefined,
): CalendarListMode {
  const slots = envelope?.slots ?? {};

  const directMode = getSlotString(envelope, 'mode');
  if (directMode && isCalendarListMode(directMode)) {
    return directMode;
  }

  for (const key of [
    'day',
    'week',
    'month',
    'year',
    'next_days',
    'upcoming',
    'past',
  ] as const) {
    const nested = slots[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedMode = (nested as Record<string, unknown>)['mode'];
      if (typeof nestedMode === 'string' && isCalendarListMode(nestedMode)) {
        return nestedMode;
      }
      if (key !== 'upcoming' && key !== 'past' && isCalendarListMode(key)) {
        return key;
      }
    }
  }

  if (getSlotNumber(envelope, 'dayOffset') !== null) {
    return 'day';
  }
  if (getSlotNumber(envelope, 'weekOffset') !== null) {
    return 'week';
  }
  if (getSlotNumber(envelope, 'monthOffset') !== null) {
    return 'month';
  }
  if (getSlotNumber(envelope, 'yearOffset') !== null) {
    return 'year';
  }
  if (getSlotNumber(envelope, 'spanDays') !== null) {
    return 'next_days';
  }

  return DEFAULT_CALENDAR_LIST_MODE;
}

/**
 * Reads dayOffset from flat slots or nested `slots.day.dayOffset`.
 */
export function getListDayOffset(
  envelope: IntentEnvelope | undefined,
): number {
  const flat = getSlotNumber(envelope, 'dayOffset');
  if (flat !== null) {
    return flat;
  }

  const nested = envelope?.slots?.day;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const value = (nested as Record<string, unknown>)['dayOffset'];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

/**
 * Returns a valid IANA timezone supplied in the intent envelope.
 */
export function getSlotTimeZone(
  envelope: IntentEnvelope | undefined,
): string | null {
  const timeZone = getSlotString(envelope, 'timeZone');

  if (!timeZone) {
    return null;
  }

  return DateTime.now().setZone(timeZone).isValid
    ? timeZone
    : null;
}

/**
 * Returns a valid one-based selection index.
 */
export function getSlotSelectedIndex(
  envelope: IntentEnvelope | undefined,
  max: number,
): number | null {
  if (!Number.isInteger(max) || max < 1) {
    return null;
  }

  const selectedIndex = getSlotNumber(
    envelope,
    'selectedIndex',
  );

  if (
    selectedIndex === null ||
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 1 ||
    selectedIndex > max
  ) {
    return null;
  }

  return selectedIndex;
}