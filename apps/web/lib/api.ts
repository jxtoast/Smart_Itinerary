/**
 * The one place pages get an API client from (Phase 2 rewiring, T2.3–T2.5).
 *
 * Mock mode (Cypress / offline development — see isMockModeEnabled) swaps the
 * real client for the canned in-memory one; both implement the same `ApiClient`
 * interface, so page code cannot tell the difference. Real mode talks
 * same-origin `/api/*`, which next.config.ts proxies to the gateway.
 */
import {
  createApiClient,
  createMockApiClient,
  isMockModeEnabled,
  type ApiClient,
} from "@smart/api-client";

export function getApiClient(): ApiClient {
  return isMockModeEnabled() ? createMockApiClient() : createApiClient();
}
