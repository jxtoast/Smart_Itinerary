import express from "express";
import {
  createDbPool,
  createLogger,
  createTokenVerifier,
  env,
  envInt,
  errorHandler,
} from "@smart/shared/src/server";
import { createItineraryRouter } from "./routes/itineraryRoutes";
import { cookieMiddleware } from "./cookies";
import { closeBroker } from "./itineraryCreatedPublisher";

/**
 * Itinerary Service (diagram: "Itinerary Service" with its own
 * "Amazon RDS (Itinerary DB)" and the "Message Broker").
 *
 * Owns everything about a saved trip: itinerary rows plus demographics,
 * accommodation, days and activities (DDL: db/init/itinerary-service.sql),
 * and publishes `itinerary.created` to RabbitMQ after each successful save.
 *
 * Port 8082 · env vars: SERVICE_NAME, PORT, DATABASE_URL, AMQP_URL,
 * TOKEN_VERIFY_MODE (+ JWT_DEV_SECRET, or COGNITO_* in cognito mode), LOG_LEVEL.
 *
 * The gateway (8080) forwards /api/itineraries/* here after verifying the
 * JWT; the routes re-verify so direct mobile/third-party access is safe too.
 */

const serviceName = env("SERVICE_NAME", "itinerary-service");
const port = envInt("PORT", 8082);
const logger = createLogger(serviceName);

// pg connects lazily, so an unreachable database surfaces as per-request
// errors (logged, 500) rather than a process that never boots.
const pool = createDbPool();

const app = express();
app.use(express.json()); // itinerary payloads arrive as JSON bodies
app.use(cookieMiddleware); // populate req.cookies for the shared JWT adapter
app.use("/api/itineraries", createItineraryRouter(pool, createTokenVerifier()));

// Liveness probe for docker-compose healthchecks and the gateway.
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: serviceName });
});

// Shared JSON error formatter: ApiError (incl. zod 400s) → status + message,
// anything unexpected → logged 500.
app.use(errorHandler);

const server = app.listen(port, () => {
  logger.info({ port }, `${serviceName} listening`);
});

// Graceful shutdown on `docker stop`: stop accepting requests, then release
// the RabbitMQ connection (if connected) and the database pool.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.close(() => {
    void closeBroker()
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
  // Hard exit if a connection hangs; unref() keeps it from blocking shutdown.
  setTimeout(() => process.exit(1), 10_000).unref();
});
