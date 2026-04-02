import type { Request } from 'express';
import { LAURA_SESSION_COOKIE } from './session.constants';

export type RequestWithLauraSession = Request & {
  lauraSessionId?: string;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionToken(s: string | undefined): boolean {
  return typeof s === 'string' && UUID_V4.test(s.trim());
}

/** Session id set by SessionCookieMiddleware (must run before controllers). */
export function getSessionId(req: Request): string {
  const sid = (req as RequestWithLauraSession).lauraSessionId?.trim();
  if (!sid) {
    throw new Error('Missing lauraSessionId on request (session middleware not applied?)');
  }
  return sid;
}

export function readSessionTokenFromCookie(req: Request): string | undefined {
  const raw = req.cookies?.[LAURA_SESSION_COOKIE];
  return typeof raw === 'string' ? raw.trim() : undefined;
}
