const cred: RequestInit = { credentials: 'include' };

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

export async function fetchGoogleOAuthStartUrl(): Promise<string> {
  const url = `${getApiBaseUrl()}/integrations/google/start`;
  const res = await fetch(url, { ...cred });
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

export async function fetchGoogleConnectionStatus(): Promise<boolean> {
  const url = `${getApiBaseUrl()}/integrations/google/status`;
  const res = await fetch(url, { ...cred });
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { connected?: boolean };
  return Boolean(data.connected);
}
