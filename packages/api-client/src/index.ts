/**
 * @smart/api-client — the typed browser client for the Smart Itinerary
 * platform (diagram: "Clients — Web").
 *
 * UI code imports `createApiClient` (real HTTP via the gateway) or
 * `createMockApiClient` (canned in-memory data for offline/Cypress runs) —
 * both satisfy the same `ApiClient` interface, and every failure arrives as
 * an `ApiClientError` with the HTTP status attached.
 *
 * All request/response contracts come from `@smart/shared` zod DTOs; this
 * package never talks to a database, broker or any other Node-only system.
 */

export { DEFAULT_API_BASE_URL, isMockModeEnabled, resolveApiBaseUrl } from "./env";
export type { ApiClientOptions } from "./env";
export { ApiClientError, NETWORK_FAILURE_STATUS } from "./errors";
export { encodePathSegment, requestJson } from "./request";
export type { FetchLike, RequestOptions, SchemaLike } from "./request";
export { createApiClient } from "./client";
export type { RealApiClientOptions } from "./client";
export { createMockApiClient } from "./mock/mockClient";
export {
  MOCK_COUNTRIES,
  MOCK_DEMOGRAPHICS,
  MOCK_HOTELS,
  MOCK_ITINERARY,
  MOCK_TRAVEL_TYPES,
  MOCK_USER,
  MOCK_USER_ID,
} from "./mock/mockData";
export type { MockApiState, MockGroup, MockItinerary } from "./mock/mockData";
export type { ApiClient, GenerateItineraryRequest, GenerateTextResponse, UserProfile } from "./types";
