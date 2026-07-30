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
 * Falls back to "upcoming" when the slot is missing or invalid.
 */
export function getSlotListMode(
  envelope: IntentEnvelope | undefined,
): CalendarListMode {
  const mode = getSlotString(envelope, 'mode');

  return mode && isCalendarListMode(mode)
    ? mode
    : DEFAULT_CALENDAR_LIST_MODE;
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