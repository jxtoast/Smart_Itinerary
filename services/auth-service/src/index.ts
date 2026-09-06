/**
 * auth-service entrypoint — implements the diagram's
 * "Authentication Service (User Profile)" box on port 8081.
 *
 * Owns the `users` and `users_demographics` tables (db/init/auth-service.sql)
 * and serves /api/auth/me, /api/auth/profile and /api/auth/demographics.
 *
 * Env: SERVICE_NAME, PORT, DATABASE_URL, TOKEN_VERIFY_MODE, JWT_DEV_SECRET,
 * LOG_LEVEL (see .env.example).
 *
 * Startup order mirrors the request path's dependency direction:
 *   DATABASE_URL → pg pool → repositories → routers → express app.
 */
import { createDbPool, createLogger, createTokenVerifier, envInt } from "@smart/shared/src/server";
import { buildApp } from "./app";
import { UsersRepository } from "./repositories/users.repository";
import { UsersDemographicsRepository } from "./repositories/users-demographics.repository";

const serviceName = process.env.SERVICE_NAME ?? "auth-service";
const port = envInt("PORT", 8081);
const logger = createLogger(serviceName);

// DATABASE_URL points at this service's own database (database-per-service:
// auth-db/smart_auth in docker-compose, Amazon RDS on AWS). createDbPool
// throws fast when the variable is missing, so misconfiguration is loud.
const pool = createDbPool();

// TOKEN_VERIFY_MODE=dev (default) accepts locally-signed HS256 dev tokens —
// the same kind the gateway's dev-token route mints. TOKEN_VERIFY_MODE=cognito
// verifies Cognito's JWKS instead (lands with T2.2). The gateway already
// verifies tokens in front of us, but we re-verify: never trust a hop.
const deps = {
  verifier: createTokenVerifier(),
  users: new UsersRepository(pool),
  demographics: new UsersDemographicsRepository(pool),
};

const app = buildApp({ serviceName, ...deps });

app.listen(port, () => {
  logger.info({ port, tokenVerifyMode: process.env.TOKEN_VERIFY_MODE ?? "dev" }, `${serviceName} listening`);
});
