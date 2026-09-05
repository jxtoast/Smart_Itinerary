import { NextFunction, Request, Response } from "express";

/**
 * Cookie middleware for the auth-service.
 *
 * The shared JWT adapter (packages/shared/src/adapters/jwt.ts) reads the
 * `si_session` web session cookie from `req.cookies` as an alternative to the
 * Bearer header — this is the path the browser uses: the Cognito id_token the
 * web callback stores (apps/web/app/auth/callback) rides to GET /api/auth/me
 * as a cookie through the gateway rewrite. Express only exposes `req.cookies`
 * through the cookie-parser package, so this ~10-line parser populates it
 * instead of adding a dependency (same approach as gemini/itinerary/tools).
 */

function parseCookieHeader(header: string | undefined): Record<string, string | undefined> {
  const cookies: Record<string, string | undefined> = {};
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

export function cookieMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}
