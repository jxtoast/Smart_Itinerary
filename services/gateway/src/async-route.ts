/**
 * Express 4 does not observe promises returned by handlers — a rejected async
 * handler would become an unhandled rejection and crash the gateway. This
 * wrapper forwards rejections to the error middleware instead.
 *
 * (Locally typed copy of @smart/shared's `asyncHandler`: the shared version
 * types `req` as `never`, which TS rejects when assigning to an Express
 * `RequestHandler`. Shared stays untouched per the Phase 1 conventions.)
 */

import { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
