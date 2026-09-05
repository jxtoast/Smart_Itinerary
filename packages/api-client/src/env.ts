/**
 * Base-URL resolution for the browser API client (diagram: "Clients — Web").
 *
 * The relative default `/api` is correct once apps/web forwards same-origin
 * `/api/*` to the gateway (services/gateway, :8080) via a Next.js rewrite —
 * each UI cutover task (T2.2+) lands the rewrite for the areas it switches
 * over. Until an area is cut over, apps/web still serves its own legacy
 * `/api` routes, so wiring must add the rewrite in the same change. Pointing
 * the client at a different origin (e.g. a direct gateway URL in Cypress) is
 * done with `NEXT_PUBLIC_API_URL` — the ONE allowed `NEXT_PUBLIC_` var,
 * because a base URL is configuration, not a secret.
 *
 * Note: `NEXT_PUBLIC_*` vars must be read as LITERAL member accesses —
 * Next.js inlines them into the browser bundle by static replacement, which
 * a dynamic `process.env[varName]` lookup would defeat.
 */

/** Same-origin default; requires the gateway rewrite from the cutover tasks. */
export const DEFAULT_API_BASE_URL = "/api";

export interface ApiClientOptions {
  /**
   * Override the base URL for every request (must include the `/api` prefix —
   * the gateway forwards `/api/<area>/*` paths verbatim to the services).
   * Defaults to `NEXT_PUBLIC_API_URL`, then the same-origin `/api`.
   */
  baseUrl?: string;
}

/**
 * Resolve the base URL every request is prefixed with:
 * explicit option > NEXT_PUBLIC_API_URL > same-origin "/api".
 */
export function resolveApiBaseUrl(options: ApiClientOptions = {}): string {
  return options.baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
}

/**
 * True when the web app's mock-auth flag is on (`NEXT_PUBLIC_ENABLE_MOCK_AUTH`,
 * set by apps/web/cypress.config.ts during tests). Callers use this to pick
 * `createMockApiClient()` instead of the real `createApiClient()` — the same
 * switch the legacy UserService uses for its fake session user.
 */
export function isMockModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === "true";
}
