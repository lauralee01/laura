export function shouldRefreshGoogleStatus(reply: string): boolean {
  const normalizedReply = reply.toLowerCase();

  return (
    normalizedReply.includes('connect google again') ||
    normalizedReply.includes('google session could not be renewed') ||
    normalizedReply.includes('google connection expired') ||
    normalizedReply.includes('google is not connected')
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
