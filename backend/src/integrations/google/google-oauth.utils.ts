import { createHash } from 'crypto';

/** Stable fingerprint of session id for logs (never log raw session id). */
export function sessionFingerprint(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 12);
}

export function tryHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid URL)';
  }
}
