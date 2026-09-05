/**
 * tools-service entrypoint — implements the diagram's "Tools Service
 * (Export PDF, Sharing)" box on port 8084.
 *
 * Owns the tools-db tables groups, group_members, itinerary_shares and
 * pdf_exports (db/init/tools-service.sql) and serves:
 *   /api/tools/groups   — groups CRUD + email-invite token + join
 *   /api/tools/shares   — share links (record + token + itinerary.shared)
 *   /api/tools/export   — itinerary → pdfkit → MinIO/S3 → presigned URL
 *
 * The itinerary data itself lives in the itinerary-service's database, so
 * PDF export and the read-only share view fetch the aggregate over HTTP
 * (itineraryClient.ts) with the caller's own credentials.
 *
 * Env: SERVICE_NAME, PORT, DATABASE_URL, AMQP_URL, ITINERARY_SERVICE_URL,
 * WEB_PUBLIC_URL, S3_* (storage adapter), TOKEN_VERIFY_MODE (+ JWT_DEV_SECRET
 * or COGNITO_*), LOG_LEVEL — see .env.example.
 */
import {
  createDbPool,
  createLogger,
  createStorage,
  createTokenVerifier,
  env,
  envInt,
} from "@smart/shared";
import { buildApp } from "./app";
import { createEventPublisher, closeBroker } from "./eventPublisher";
import { createItineraryClient } from "./itineraryClient";

const serviceName = env("SERVICE_NAME", "tools-service");
const port = envInt("PORT", 8084);
const logger = createLogger(serviceName);

// pg connects lazily, so an unreachable database surfaces as per-request
// errors (logged, 500) rather than a process that never boots. Same idea for
// the S3/MinIO client: instantiating it opens no connection, so the service
// boots fine before MinIO is up and export requests fail honestly instead.
const deps = {
  verifier: createTokenVerifier(),
  pool: createDbPool(),
  storage: createStorage(),
  events: createEventPublisher(),
  itineraryClient: createItineraryClient(),
  // Share links point at the web app's /shared/<token> page (T2.5); in
  // compose the web app is reachable from the browser at localhost:3000,
  // which is why this URL must be the *public* origin, not a compose hostname.
  webPublicUrl: env("WEB_PUBLIC_URL", "http://localhost:3000"),
};

const app = buildApp({ serviceName, ...deps });

const server = app.listen(port, () => {
  logger.info(
    { port, tokenVerifyMode: env("TOKEN_VERIFY_MODE", "dev") },
    `${serviceName} listening`
  );
});

// Graceful shutdown on `docker stop`: stop accepting requests, then release
// the RabbitMQ connection (if connected) and the database pool.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.close(() => {
    void closeBroker()
      .then(() => deps.pool.end())
      .finally(() => process.exit(0));
  });
  // Hard exit if a connection hangs; unref() keeps it from blocking shutdown.
  setTimeout(() => process.exit(1), 10_000).unref();
});
