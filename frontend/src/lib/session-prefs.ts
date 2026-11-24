import { getApiBaseUrl } from './api-base';

export const SESSION_TONE_PRESETS = ['warm', 'concise', 'casual'] as const;

export type SessionTone = (typeof SESSION_TONE_PRESETS)[number];

export type SessionPrefs = {
  timeZone: string | null;
  location: string | null;
  tone: SessionTone;
  defaultMeetingMinutes: number;
};

export type SessionPrefsPatch = {
  timeZone?: string;
  location?: string | null;
  tone?: SessionTone;
  defaultMeetingMinutes?: number;
};

const cred: RequestInit = { credentials: 'include' };

function isSessionTone(value: unknown): value is SessionTone {
  return (
    typeof value === 'string' &&
    (SESSION_TONE_PRESETS as readonly string[]).includes(value)
  );
}

function parsePrefs(data: unknown): SessionPrefs {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Session prefs response was not an object.');
  }

  const raw = data as Record<string, unknown>;
  const timeZone =
    typeof raw.timeZone === 'string' && raw.timeZone.trim()
      ? raw.timeZone.trim()
      : null;
  const location =
    typeof raw.location === 'string' && raw.location.trim()
      ? raw.location.trim()
      : null;
  const tone = isSessionTone(raw.tone) ? raw.tone : 'warm';
  const minutesRaw = raw.defaultMeetingMinutes;
  const minutes =
    typeof minutesRaw === 'number'
      ? minutesRaw
      : typeof minutesRaw === 'string'
        ? Number(minutesRaw)
        : 60;

  return {
    timeZone,
    location,
    tone,
    defaultMeetingMinutes:
      Number.isFinite(minutes) && minutes >= 15 && minutes <= 180
        ? Math.round(minutes)
        : 60,
  };
}

export async function fetchSessionPrefs(): Promise<SessionPrefs> {
  const url = `${getApiBaseUrl()}/session`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Session prefs request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Session prefs response was not valid JSON.');
  }
  return parsePrefs(data);
}

export async function patchSessionPrefs(
  patch: SessionPrefsPatch,
): Promise<SessionPrefs> {
  const url = `${getApiBaseUrl()}/session`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(patch),
  });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Session prefs update failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Session prefs update response was not valid JSON.');
  }
  return parsePrefs(data);
}
