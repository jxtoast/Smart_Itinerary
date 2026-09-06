import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import pino, { Logger } from "pino";
import { ZodType } from "zod";

/**
 * HTTP helpers shared by every service: structured logging (CloudWatch-ready
 * JSON), a typed ApiError, zod body validation and an async wrapper.
 *
 * Typed against express's own types (`@types/express` is a devDependency of
 * this package). The import is type-only — erased at runtime, so nothing
 * express ever reaches a bundle; but `asyncHandler`/`errorHandler` now return
 * real `RequestHandler`/`ErrorRequestHandler`s, which is what lets every
 * service drop its locally-typed copies of these wrappers.
 */

export function createLogger(serviceName: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: serviceName },
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }
  static upstream(status: number, message: string) {
    return new ApiError(status === 0 ? 502 : status >= 500 ? 502 : status, message);
  }
}

/**
 * Wrap an async route handler so rejections reach the error middleware.
 *
 * Express 4 does not observe promises returned by handlers — a rejected
 * async handler would become an unhandled rejection and crash the process.
 * This wrapper forwards rejections to `next(error)`, landing in the shared
 * `errorHandler` below (→ JSON 4xx/5xx).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next
) => {
  const logger = createLogger("http");
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  const err = error as { status?: number; message?: string };
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.message ?? "Request failed" });
    return;
  }
  logger.error({ err: error }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
};

/** Validate a request body against a zod schema, throwing 400 on failure. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw ApiError.badRequest("Invalid request body", result.error.flatten());
  }
  return result.data;
}
