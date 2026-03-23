function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

export async function fetchGoogleOAuthStartUrl(
  sessionId: string
): Promise<string> {
  const url = new URL(`${getApiBaseUrl()}/integrations/google/start`);
  url.searchParams.set('sessionId', sessionId);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Start failed (${res.status})`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error('Invalid start response');
  }
  return data.url;
}

export async function fetchGoogleConnectionStatus(
  sessionId: string
): Promise<boolean> {
  const url = new URL(`${getApiBaseUrl()}/integrations/google/status`);
  url.searchParams.set('sessionId', sessionId);
  const res = await fetch(url.toString());
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { connected?: boolean };
  return Boolean(data.connected);
}
