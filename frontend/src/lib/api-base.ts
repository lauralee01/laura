/**
 * Shared API origin for browser clients. Trailing slash is stripped.
 */
export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}
