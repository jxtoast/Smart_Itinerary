/**
 * Gateway service (diagram: "API Gateway Instance 1 / Instance 2").
 *
 * The single entry point every client talks to (web via the Next.js
 * `/api/:path*` rewrite, mobile/third-party via Bearer tokens). It:
 *   - verifies JWTs (Cognito JWKS in prod, HS256 dev tokens in mock mode)
 *     from `Authorization: Bearer` or the `si_session` cookie,
 *   - forwards `/api/{auth,itineraries,gemini,tools}/*` to the matching
 *     microservice (route table in upstreams.ts, URLs from env),
 *   - rate-limits and hardens (express-rate-limit + helmet),
 *   - aggregates upstream health at GET /healthz,
 *   - mints mock-auth tokens at POST /api/auth/dev-token (dev mode only).
 *
 * Port: 8080. Env vars: see services/gateway/.env.example.
 */

import express, { Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  AuthClaims,
  ApiError,
  createLogger,
  createTokenVerifier,
  env,
  envInt,
  errorHandler,
  requireClaims,
} from "@smart/shared";
import { UPSTREAM_ROUTES, resolveUpstreamUrl } from "./upstreams";
import { captureRawBody, createProxyHandler, unknownApiRouteHandler } from "./proxy";
import { healthHandler } from "./health";
import { devTokenHandler } from "./dev-token";

const logger = createLogger(process.env.SERVICE_NAME ?? "gateway");
const port = Number(process.env.PORT ?? 8080);

/** Rate-limit defaults: generous enough for page loads, tight enough to matter. */
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RATE_LIMIT_MAX = 300;

/** Routes reachable without a JWT. dev-token must be public — it MINTS tokens. */
const PUBLIC_API_PATHS = new Set(["/api/auth/dev-token"]);

const app: Express = express();

// --- global middleware -------------------------------------------------------
app.use(helmet()); // sane security headers; API-only service so CSP is inert
app.use(cookieParser()); // populates req.cookies so the shared adapter can read si_session
app.use(captureRawBody); // JSON parsing + raw bytes for byte-for-byte proxying

// Request log — one honest line per API call (user, status, latency).
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }
  const startedAt = Date.now();
  res.on("finish", () => {
    const claims = res.locals.claims as AuthClaims | undefined;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        user: claims?.sub,
      },
      "request"
    );
  });
  next();
});

// Health check is intentionally registered BEFORE rate limiting: LB / compose
// probes must never be throttled. Always answers 200; the body tells the truth.
app.get("/healthz", healthHandler);

// --- /api/* pipeline: rate limit -> auth -> routes ---------------------------
app.use(
  "/api",
  rateLimit({
    windowMs: envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS),
    limit: envInt("RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  })
);

// JWT gate (diagram: "JWT verified at gateway"). jose failures (expired,
// bad signature) as well as missing tokens both become clean 401s here.
const tokenVerifier = createTokenVerifier(); // mode from TOKEN_VERIFY_MODE env
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/") || PUBLIC_API_PATHS.has(req.path)) {
    next();
    return;
  }
  try {
    res.locals.claims = await requireClaims(tokenVerifier, req);
    next();
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = (error as Error).message;
    next(
      status === 401
        ? ApiError.unauthorized(message)
        : ApiError.unauthorized("Invalid or expired token")
    );
  }
});

// Gateway-local route first so the /api/auth proxy doesn't swallow it.
app.post("/api/auth/dev-token", devTokenHandler);

// Forward everything else to the route table (prefix stripped, auth headers kept).
for (const route of UPSTREAM_ROUTES) {
  app.use(route.publicPrefix, createProxyHandler(route));
}

// Unmatched /api/* (and anything else) -> JSON 404, then the shared error handler.
app.use("/api", unknownApiRouteHandler);
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);

app.listen(port, () => {
  logger.info(
    {
      port,
      tokenVerifyMode: env("TOKEN_VERIFY_MODE", "dev"),
      upstreams: UPSTREAM_ROUTES.map((route) => ({
        area: route.publicPrefix,
        service: route.serviceName,
        configured: !!resolveUpstreamUrl(route),
      })),
    },
    "gateway listening"
  );
});
