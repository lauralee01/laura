import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { LAURA_SESSION_COOKIE } from './session.constants';
import {
  isValidSessionToken,
  readSessionTokenFromCookie,
  type RequestWithLauraSession,
} from './session.util';

/**
 * Ensures every request has a stable anonymous session id in an HttpOnly cookie.
 * No login — same model as before (UUID per browser), but JS cannot read the token.
 */
@Injectable()
export class SessionCookieMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    let sid = readSessionTokenFromCookie(req);
    if (!isValidSessionToken(sid)) {
      sid = randomUUID();
      const sameSiteEnv =
        process.env.SESSION_COOKIE_SAME_SITE?.trim().toLowerCase();
      const sameSite: 'lax' | 'strict' | 'none' =
        sameSiteEnv === 'none' || sameSiteEnv === 'strict' ? sameSiteEnv : 'lax';
      const secure =
        sameSite === 'none'
          ? true
          : process.env.NODE_ENV === 'production';

      res.cookie(LAURA_SESSION_COOKIE, sid, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }
    (req as RequestWithLauraSession).lauraSessionId = sid!.trim();
    next();
  }
}
