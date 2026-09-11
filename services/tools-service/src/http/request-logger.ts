/**
 * request-logger.ts — one structured pino line per completed request.
 *
 * Structured (JSON) logs keep the service CloudWatch-ready: the same shape
 * works locally and on ECS without a logging library swap. Logged on the
 * response "finish" event so the final status code is the real one, even
 * when an error middleware produced it.
 */
import { NextFunction, Request, Response } from "express";
import { Logger } from "pino";

export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        "request completed"
      );
    });
    next();
  };
}
