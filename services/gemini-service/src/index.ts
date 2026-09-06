import express from "express";
import {
  createDbPool,
  createLogger,
  createTokenVerifier,
  env,
  envInt,
  errorHandler,
} from "@smart/shared/src/server";
import { createGeminiRouter } from "./routes/geminiRoutes";
import { cookieMiddleware } from "./cookies";
import { FlightsService } from "./flights/FlightsService";
import { GeminiService } from "./gemini/GeminiService";
import {
  AMADEUS_API_KEY_VAR,
  AMADEUS_BASE_URL_VAR,
  DEFAULT_AMADEUS_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_API_KEY_VAR,
  GEMINI_MODEL_VAR,
} from "./config";

/**
 * Gemini Service (diagram: "Gemini Service (Hotel Service)" with its own
 * "Amazon RDS (Gemini DB)").
 *
 * Owns everything AI-assisted in the platform: the day-by-day itinerary and
 * weather generations, the /plan facade that combines them with real flight
 * offers from Amadeus, AI hotel suggestions, and the reference data
 * (countries + travel types) the plan-itinerary form is rendered from.
 * Every generation is audited in its own database (DDL:
 * db/init/gemini-service.sql) — the audit trail is what justifies this
 * service having a dedicated database in the diagram.
 *
 * Port 8083 · env vars: SERVICE_NAME, PORT, DATABASE_URL, LOG_LEVEL,
 * GEMINI_API_KEY (+ GEMINI_MODEL), AMADEUS_API_KEY (+ AMADEUS_FLIGHTS_API_BASE_URL).
 *
 * Keys are SERVER-SIDE ONLY (docs/TASKS.md hard constraint 7) — the monolith
 * shipped them to the browser as NEXT_PUBLIC_ vars. A missing key degrades
 * gracefully: the service still boots and serves /healthz + reference data;
 * only the endpoints that need the key answer 503.
 *
 * The gateway (8080) forwards /api/gemini/* here after verifying the JWT;
 * the routes re-verify so direct mobile/third-party access is safe too.
 */

const serviceName = env("SERVICE_NAME", "gemini-service");
const port = envInt("PORT", 8083);
const logger = createLogger(serviceName);

// pg connects lazily, so an unreachable database surfaces as per-request
// errors (logged, 500) rather than a process that never boots.
const pool = createDbPool();

// Third-party clients are built once at boot; null = capability disabled
// (its endpoints answer 503 with an explanation instead of crashing).
const geminiService = process.env[GEMINI_API_KEY_VAR]
  ? new GeminiService(process.env[GEMINI_API_KEY_VAR], env(GEMINI_MODEL_VAR, DEFAULT_GEMINI_MODEL))
  : null;
const flightsService = process.env[AMADEUS_API_KEY_VAR]
  ? new FlightsService(env(AMADEUS_BASE_URL_VAR, DEFAULT_AMADEUS_BASE_URL), process.env[AMADEUS_API_KEY_VAR])
  : null;

const app = express();
app.use(express.json()); // plan/hotel/flight requests arrive as JSON bodies
app.use(cookieMiddleware); // populate req.cookies for the shared JWT adapter
app.use(
  "/api/gemini",
  createGeminiRouter({ pool, verifier: createTokenVerifier(), geminiService, flightsService })
);

// Liveness probe for docker-compose healthchecks and the gateway.
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: serviceName });
});

// JSON 404 for anything no route claimed (express's default is HTML).
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
});

// Shared JSON error formatter: ApiError (incl. zod 400s) → status + message,
// anything unexpected → logged 500.
app.use(errorHandler);

const server = app.listen(port, () => {
  logger.info(
    {
      port,
      aiGeneration: geminiService ? `configured (model ${geminiService.model})` : "GEMINI_API_KEY missing — AI endpoints answer 503",
      flightSearch: flightsService ? "configured" : "AMADEUS_API_KEY missing — flight endpoints answer 503",
    },
    `${serviceName} listening`
  );
});

// Graceful shutdown on `docker stop`: stop accepting requests, then release
// the database pool.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  // Hard exit if a connection hangs; unref() keeps it from blocking shutdown.
  setTimeout(() => process.exit(1), 10_000).unref();
});
