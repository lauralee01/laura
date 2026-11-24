import { detectSessionLocation } from './session-prefs';

/**
 * Browser geolocation helpers.
 *
 * Privacy rules (keep in sync with the Privacy Policy):
 * - We only ask when the user taps "Use my current location" (or when the
 *   browser already granted permission earlier, for a quiet refresh).
 * - Coordinates go to our backend once, are rounded and turned into a city
 *   label there, and are never stored. The browser keeps nothing either.
 */

export type BrowserLocationErrorCode =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'lookup_failed';

export class BrowserLocationError extends Error {
  readonly code: BrowserLocationErrorCode;

  constructor(code: BrowserLocationErrorCode) {
    super(code);
    this.name = 'BrowserLocationError';
    this.code = code;
  }
}

export type GeolocationPermission =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

const POSITION_TIMEOUT_MS = 10_000;
/** A fix up to 10 minutes old is fine: we only need the city. */
const POSITION_MAX_AGE_MS = 10 * 60 * 1000;

const AUTO_LOCATION_STORAGE_KEY = 'laura.autoLocation';
const AUTO_LOCATION_LAST_REFRESH_KEY = 'laura.autoLocation.lastRefresh';
/** Quiet refresh at most once per tab session per 15 minutes. */
const AUTO_REFRESH_MIN_INTERVAL_MS = 15 * 60 * 1000;

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Reads the current permission WITHOUT triggering a prompt.
 * Browsers without the Permissions API report 'prompt' (unknown), which is
 * safe: callers only act quietly on an explicit 'granted'.
 */
export async function getGeolocationPermission(): Promise<GeolocationPermission> {
  if (!isGeolocationSupported()) {
    return 'unsupported';
  }
  if (!navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

function getPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new BrowserLocationError('denied'));
        } else if (error.code === error.TIMEOUT) {
          reject(new BrowserLocationError('timeout'));
        } else {
          reject(new BrowserLocationError('unavailable'));
        }
      },
      {
        // City-level is enough: skip GPS, save battery, and respond faster.
        enableHighAccuracy: false,
        timeout: POSITION_TIMEOUT_MS,
        maximumAge: POSITION_MAX_AGE_MS,
      },
    );
  });
}

/**
 * Asks the browser for the user's position (may show the permission prompt),
 * has the backend turn it into a city label, and returns that label.
 */
export async function detectBrowserLocation(): Promise<string> {
  if (!isGeolocationSupported()) {
    throw new BrowserLocationError('unsupported');
  }

  const coords = await getPosition();

  try {
    return await detectSessionLocation(coords.latitude, coords.longitude);
  } catch {
    throw new BrowserLocationError('lookup_failed');
  }
}

/** Short, user-facing explanation for a failed detection. */
export function describeLocationError(error: unknown): string {
  const code =
    error instanceof BrowserLocationError ? error.code : 'unavailable';

  switch (code) {
    case 'denied':
      return 'Location access is blocked for this site. Type a city instead, or allow it in your browser’s site settings.';
    case 'timeout':
      return 'Finding your location took too long. Type a city instead.';
    case 'unsupported':
      return 'This browser can’t share location. Type a city instead.';
    case 'lookup_failed':
      return 'I couldn’t work out your city from that. Type a city instead.';
    default:
      return 'I couldn’t get your location. Type a city instead.';
  }
}

/** Whether quiet city refresh is enabled (default on; only runs if permitted). */
export function isAutoLocationEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUTO_LOCATION_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoLocationEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.removeItem(AUTO_LOCATION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(AUTO_LOCATION_STORAGE_KEY, 'off');
    }
  } catch {
    // Storage unavailable (private mode): the toggle just won't persist.
  }
}

/**
 * Quietly refreshes the stored city when the browser has ALREADY granted
 * location access. Never prompts, never shows errors, and is throttled.
 */
export async function refreshLocationIfPermitted(): Promise<void> {
  if (!isAutoLocationEnabled()) {
    return;
  }

  try {
    const last = Number(
      window.sessionStorage.getItem(AUTO_LOCATION_LAST_REFRESH_KEY) ?? 0,
    );
    if (Date.now() - last < AUTO_REFRESH_MIN_INTERVAL_MS) {
      return;
    }
  } catch {
    // No sessionStorage: fall through and refresh once per load.
  }

  if ((await getGeolocationPermission()) !== 'granted') {
    return;
  }

  try {
    await detectBrowserLocation();
    try {
      window.sessionStorage.setItem(
        AUTO_LOCATION_LAST_REFRESH_KEY,
        String(Date.now()),
      );
    } catch {
      // ignore
    }
  } catch {
    // Silent by design: the user can still type a city.
  }
}
