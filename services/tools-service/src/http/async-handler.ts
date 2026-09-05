/**
 * async-handler.ts — express-shaped bridge to @smart/shared's asyncHandler.
 *
 * The shared helper deliberately avoids depending on express (only services
 * know about express), so its structural types don't satisfy express's
 * RequestHandler. This wrapper restores express types in exactly one place;
 * runtime behaviour is identical: a rejected handler promise is forwarded to
 * next(error) and lands in the shared errorHandler (→ JSON 4xx/5xx).
 */
import { NextFunction, Request, RequestHandler, Response } from "express";
import { asyncHandler as sharedAsyncHandler } from "@smart/shared";

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown>
): RequestHandler {
  // `as never` / `as unknown as RequestHandler` exist only to cross the
  // shared helper's express-free types (see file header) — the values at
  // runtime are the real express req/res objects.
  return sharedAsyncHandler(handler as never) as unknown as RequestHandler;
}
