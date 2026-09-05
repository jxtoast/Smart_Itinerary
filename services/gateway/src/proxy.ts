/**
 * Reverse-proxy forwarding — the gateway's main job on the diagram
 * ("API Gateway Instance 1 / Instance 2" routing to the service backends).
 *
 * Design notes for a first-time reader:
 * - Bodies are forwarded BYTE-FOR-BYTE. express.json() would re-serialize the
 *   body and could subtly change it, so `captureRawBody` stashes the original
 *   bytes and the proxy sends those instead. (All platform payloads are JSON
 *   — validation happens downstream in each service via the @smart/shared zod
 *   DTOs.)
 * - An upstream that is not configured (env var unset) or unreachable
 *   (ECONNREFUSED, timeout) is reported as a 502 `{ error: "<service> is down" }`.
 *   A dead dependency must never take the gateway process down with it.
 * - Auth headers (`Authorization`, cookies) pass through untouched so each
 *   service can re-verify claims itself via @smart/shared if it needs them.
 * - Express 4 does not catch async handler rejections (that would crash the
 *   process), so the handler body is one try/catch that always routes
 *   failures into `next(error)`.
 */

import express, { NextFunction, Request, RequestHandler, Response } from "express";
import { createLogger, ApiError } from "@smart/shared";
import {
  UpstreamRoute,
  resolveUpstreamUrl,
  upstreamForwardPath,
} from "./upstreams";

const logger = createLogger("gateway-proxy");

/** Largest accepted request body (JSON itineraries are small; PDFs go via presigned URLs). */
const BODY_LIMIT = "1mb";
/** Hard ceiling for one upstream call. The plan facade runs two real Gemini
 * generations (concurrently since the facade parallelized them) and each can
 * take tens of seconds on a cold call — the ceiling must fit the slowest
 * honest request, not just the average one. */
const UPSTREAM_TIMEOUT_MS = 120_000;

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * Parse JSON bodies (for gateway-local routes like dev-token) AND keep the
 * original bytes around for the proxy to forward unchanged.
 */
export const captureRawBody: RequestHandler = express.json({
  limit: BODY_LIMIT,
  verify: (req, _res, buffer) => {
    (req as RequestWithRawBody).rawBody = buffer;
  },
});

/** Headers that must not be relayed: hop-by-hop + ones fetch/express own. */
const STRIPPED_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "host",
  "content-length",
]);
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  // We request `identity` encoding, so an encoding header would be a lie.
  "content-encoding",
  "content-length",
]);

/**
 * Build the forwarding handler for one route-table entry. Registered per
 * prefix in index.ts (`app.use("/api/auth", handler)`), so a handler always
 * knows which upstream it serves.
 */
export function createProxyHandler(route: UpstreamRoute): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const baseUrl = resolveUpstreamUrl(route);
      if (!baseUrl) {
        // Absent upstream, not a crash: tell the client that area is down.
        throw new ApiError(
          502,
          `${route.serviceName} is down`,
          `upstream URL not configured (${route.urlEnvVar} is unset)`
        );
      }

      // Transparent forward: the client's path IS the service's path (see
      // upstreams.ts — services mount routers under the same /api/<area>
      // prefix). originalUrl keeps the query string intact.
      const target = new URL(upstreamForwardPath(req.originalUrl), baseUrl);

      const requestHeaders = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value !== "string" || STRIPPED_REQUEST_HEADERS.has(name)) continue;
        requestHeaders.set(name, value);
      }
      // Don't let upstreams compress; undici would auto-decompress and the
      // passthrough headers would no longer match the body we forward.
      requestHeaders.set("accept-encoding", "identity");

      const method = req.method;
      const rawBody = (req as RequestWithRawBody).rawBody;
      const hasBody =
        !["GET", "HEAD"].includes(method) && !!rawBody && rawBody.length > 0;

      const upstreamResponse = await fetch(target, {
        method,
        headers: requestHeaders,
        body: hasBody ? rawBody : undefined,
        // Relay redirects instead of silently following them across services.
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      // set-cookie needs list handling; a comma-joined merge would corrupt it.
      const cookies = upstreamResponse.headers.getSetCookie();
      for (const [name, value] of upstreamResponse.headers.entries()) {
        if (!STRIPPED_RESPONSE_HEADERS.has(name)) res.set(name, value);
      }
      for (const cookie of cookies) res.append("set-cookie", cookie);

      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      res.status(upstreamResponse.status).send(responseBody);
    } catch (error) {
      // Pre-formed ApiErrors (e.g. the absent-URL case) keep their honest
      // detail; anything else is a connection failure / timeout. The two are
      // answered differently: a TIMEOUT means the upstream is alive but the
      // work is genuinely slow (AI generation) → 504 with "timed out", so
      // callers can say "try again" instead of "it's down". Everything else
      // is the upstream being unreachable → 502. Either way the gateway
      // answers, never crashes — an aborted upstream must not leave the
      // browser holding a dead socket.
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      if (timedOut) {
        logger.warn({ upstream: route.serviceName, reason }, "upstream request timed out");
        next(
          new ApiError(
            504,
            `${route.serviceName} timed out after ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`,
            reason
          )
        );
        return;
      }
      logger.warn({ upstream: route.serviceName, reason }, "upstream request failed");
      next(new ApiError(502, `${route.serviceName} is down`, reason));
    }
  };
}

/**
 * Fallback for `/api/*` paths that match no route-table prefix (e.g. typos
 * like `/api/authh/me`). A JSON 404 beats Express's default HTML page.
 */
export function unknownApiRouteHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    ApiError.notFound(
      `Unknown API route: ${req.method} ${req.path} (known prefixes: /api/auth, /api/itineraries, /api/gemini, /api/tools)`
    )
  );
}
