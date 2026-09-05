/**
 * Base-URL resolution for the browser API client (diagram: "Clients — Web").
 *
 * The gateway (services/gateway, :8080) is reached same-origin through the
 * Next.js rewrite `/api/:path*` → gateway:8080, so the relative default `/api`
 * is correct in the browser and no origin needs to be configured. Pointing the
 * client at a different origin (e.g. a direct gateway URL in Cypress) is done
 * with `NEXT_PUBLIC_API_URL` — the ONE allowed `NEXT_PUBLIC_` var, because a
 * base URL is configuration, not a secret.
 *
 * Note: `NEXT_PUBLIC_*` vars must be read as LITERAL member accesses —
 * Next.js inlines them into the browser bundle by static replacement, which
 * a dynamic `process.env[varName]` lookup would defeat.
 */

/** Same-origin default: Next.js proxies /api/* to the gateway (see next.config.ts). */
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
