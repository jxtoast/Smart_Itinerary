/**
 * app.ts — express wiring for the auth-service (port 8081).
 *
 * Middleware order is the request's lifetime: structured log → JSON body
 * parsing → /healthz → the three /api/auth routers → JSON 404 → shared
 * errorHandler (catches everything the async handlers throw, including zod
 * 400s from parseBody). Keeping the app in a buildApp() factory makes the
 * wiring readable in one screen and keeps index.ts a pure composition root.
 */
import express, { Express } from "express";
import { createLogger, errorHandler } from "@smart/shared/src/server";
import { requestLogger } from "./http/request-logger";
import { cookieMiddleware } from "./cookies";
import { AuthRouteDeps } from "./deps";
import { createMeRouter } from "./routes/me.routes";
import { createProfileRouter } from "./routes/profile.routes";
import { createDemographicsRouter } from "./routes/demographics.routes";

export interface AuthAppDeps extends AuthRouteDeps {
  serviceName: string;
}

export function buildApp(deps: AuthAppDeps): Express {
  const app = express();
  const logger = createLogger(deps.serviceName);

  app.use(requestLogger(logger));
  // Malformed JSON bodies throw with status 400 and reach the error handler.
  app.use(express.json());
  // Populate req.cookies so the shared JWT adapter can read the si_session
  // cookie (the browser never sends Bearer headers — cookie-auth only).
  app.use(cookieMiddleware);

  // Liveness probe used by docker-compose (and later ECS) healthchecks —
  // deliberately database-free so a DB outage shows up in the real routes,
  // not by crashing the whole container.
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: deps.serviceName });
  });

  // The gateway proxies /api/auth/* here with the path preserved, so the
  // routers mount under /api/auth and register their public sub-paths.
  const authApi = express.Router();
  authApi.use(createMeRouter(deps));
  authApi.use(createProfileRouter(deps));
  authApi.use(createDemographicsRouter(deps));
  app.use("/api/auth", authApi);

  // JSON 404 for anything no route claimed (express's default is HTML).
  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
  });

  app.use(errorHandler);
  return app;
}
