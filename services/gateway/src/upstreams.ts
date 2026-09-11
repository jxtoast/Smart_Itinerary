/**
 * Upstream route table — the heart of the gateway (diagram: "API Gateway
 * Instance 1 / Instance 2" → service backends).
 *
 * Each entry maps a public `/api/<area>/*` path to the microservice behind it.
 * Upstream URLs come from the environment (compose sets them to service
 * hostnames; bare-metal runs point them at localhost). An unset URL is NOT a
 * crash: the route is simply reported as "down" until the service is there.
 *
 * Env vars read: AUTH_SERVICE_URL, ITINERARY_SERVICE_URL, GEMINI_SERVICE_URL,
 * TOOLS_SERVICE_URL.
 */

export interface UpstreamRoute {
  /** Public path prefix the gateway listens on, e.g. `/api/auth`. */
  publicPrefix: string;
  /** Backend service name — matches the docker-compose service name. */
  serviceName: string;
  /** Env var holding the upstream base URL (e.g. http://auth-service:8081). */
  urlEnvVar: string;
}

/**
 * `/api/auth/dev-token` is served by the gateway itself (see dev-token.ts).
 * Everything else under these prefixes is forwarded TRANSPARENTLY: the full
 * public path reaches the service unchanged, so each service mounts its
 * routers under the same prefix the client used (auth-service mounts
 * `/api/auth/*`, itinerary-service `/api/itineraries/*` — see their app.ts).
 * This is the integration contract: a transparent reverse proxy (nginx/ALB
 * style) rather than a rewriting one — services own their path namespace.
 */
export const UPSTREAM_ROUTES: UpstreamRoute[] = [
  { publicPrefix: "/api/auth", serviceName: "auth-service", urlEnvVar: "AUTH_SERVICE_URL" },
  { publicPrefix: "/api/itineraries", serviceName: "itinerary-service", urlEnvVar: "ITINERARY_SERVICE_URL" },
  { publicPrefix: "/api/gemini", serviceName: "gemini-service", urlEnvVar: "GEMINI_SERVICE_URL" },
  { publicPrefix: "/api/tools", serviceName: "tools-service", urlEnvVar: "TOOLS_SERVICE_URL" },
];

export type UpstreamState =
  | { status: "up"; url: string; latencyMs: number }
  | { status: "down"; url: string | null; reason: string };

/**
 * Resolve the configured base URL for a route. Returns `null` when the env var
 * is absent — callers must surface that as "down", never throw.
 */
export function resolveUpstreamUrl(route: UpstreamRoute): string | null {
  return process.env[route.urlEnvVar] || null;
}

/**
 * Path forwarded upstream for a request. The gateway is transparent: the
 * client's path IS the service's path (query string included), so
 * `GET /api/itineraries/user/u1` hits itinerary-service at the same path.
 */
export function upstreamForwardPath(requestPath: string): string {
  return requestPath;
}
