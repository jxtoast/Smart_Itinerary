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
 * `/api/auth/dev-token` is served by the gateway itself (see dev-token.ts),
 * everything else under these prefixes is forwarded with the prefix stripped,
 * so a call to `/api/gemini/plan` hits gemini-service at `/plan`.
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

/** Strip the public prefix so upstreams own their own routes (`/me`, `/plan`, …). */
export function upstreamPath(route: UpstreamRoute, requestPath: string): string {
  const suffix = requestPath.slice(route.publicPrefix.length);
  return suffix === "" ? "/" : suffix;
}
