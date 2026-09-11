/**
 * Session-scoped accessor for the typed API client (T2.5 tools UI).
 *
 * `getApiClient()` (lib/api.ts) builds a FRESH client on every call. That is
 * invisible in real mode — the HTTP client holds no state — but in mock mode
 * each `createMockApiClient()` call starts with fresh in-memory data, so two
 * pages would live in two different mock worlds: a group created on /groups
 * would 404 when the share link opens /shared/<token>. Holding ONE instance
 * per browser session keeps the whole tools flow (groups → share → shared
 * view → export) consistent within a visit; a reload intentionally starts a
 * clean mock slate.
 *
 * Pages still go through the exact same `ApiClient` interface — this wrapper
 * only decides WHEN the client is built, never how requests are made.
 */
import { getApiClient } from "@/lib/api";
import type { ApiClient } from "@smart/api-client";

let sessionClient: ApiClient | null = null;

/** The one ApiClient instance for this browser session (mock-safe, see above). */
export function getSessionApiClient(): ApiClient {
  if (!sessionClient) {
    sessionClient = getApiClient();
  }
  return sessionClient;
}
