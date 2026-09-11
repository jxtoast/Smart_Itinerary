/**
 * Request plumbing for the browser API client (diagram: "Clients — Web" →
 * "API Gateway Instance 1 / 2").
 *
 * One place owns the cross-cutting rules so no endpoint can forget them:
 *   - `credentials: "include"` on EVERY request — the `si_session` cookie is
 *     httpOnly, so the browser must be told to forward it (conventions §6);
 *     the gateway verifies it (JWT in cookie or Authorization header).
 *   - JSON bodies are encoded/decoded here; responses are parsed with the
 *     shared zod *ResponseSchema so a contract break fails loudly, not as a
 *     mystery shape downstream.
 *   - Every failure mode (network error, non-2xx) becomes an `ApiClientError`.
 */

import { ApiClientError, NETWORK_FAILURE_STATUS, extractErrorMessage } from "./errors";

/**
 * Minimal structural type of a zod schema (`ZodType<T>`): declared here so
 * this browser package depends only on `@smart/shared` (which re-exports the
 * schemas) instead of importing zod itself.
 */
export interface SchemaLike<T> {
  parse(data: unknown): T;
}

/** The slice of `fetch` this client uses; injectable for offline tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const JSON_CONTENT_TYPE = "application/json";

export interface RequestOptions<TResponse> {
  /** Base URL including the `/api` prefix (see resolveApiBaseUrl). */
  baseUrl: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Area-relative path, e.g. `/auth/me` — the gateway keeps `/api/...` intact. */
  path: string;
  /** Request payload; already validated by the caller with the request *Schema. */
  body?: unknown;
  /** Shared response schema; omitted for endpoints without a response contract. */
  responseSchema?: SchemaLike<TResponse>;
  /** Injectable fetch (tests / Cypress); defaults to the browser global. */
  fetchImpl?: FetchLike;
}

/**
 * Percent-encode one path parameter. Ids/tokens come from our own APIs, but a
 * share token or group id could still contain characters URL parsers treat
 * specially — encode rather than trust.
 */
export function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

/**
 * Perform one API call: fetch with cookie credentials, decode JSON, validate
 * the success body against `responseSchema`, and map every failure to an
 * `ApiClientError` carrying the status + parsed error body.
 *
 * Contract violations on 2xx (schema.parse throwing ZodError) intentionally
 * propagate as-is: that is a programming/contract bug, not a request failure
 * the UI should branch on.
 */
export async function requestJson<TResponse>(options: RequestOptions<TResponse>): Promise<TResponse> {
  const { baseUrl, method, path, body, responseSchema } = options;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const headers: Record<string, string> = { Accept: JSON_CONTENT_TYPE };
  if (body !== undefined) {
    headers["Content-Type"] = JSON_CONTENT_TYPE;
  }

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // fetch rejects on network-level failures (gateway down, offline, CORS):
    // no HTTP status exists, so status 0 marks it for the UI.
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ApiClientError(
      NETWORK_FAILURE_STATUS,
      `Network request failed (${method} ${path}): ${reason}`
    );
  }

  if (!response.ok) {
    throw await toApiClientError(response, method, path);
  }

  const responseText = await response.text();
  const data: unknown = responseText.length > 0 ? JSON.parse(responseText) : undefined;
  if (!responseSchema) {
    return data as TResponse; // void endpoints: no contract to enforce
  }
  return responseSchema.parse(data);
}

/** Read the error body (if any) and wrap it in an ApiClientError. */
async function toApiClientError(
  response: Response,
  method: string,
  path: string
): Promise<ApiClientError> {
  let body: unknown;
  try {
    const responseText = await response.text();
    body = responseText.length > 0 ? JSON.parse(responseText) : undefined;
  } catch {
    // Non-JSON error payloads (proxy HTML pages) — keep the body undefined.
  }
  return new ApiClientError(
    response.status,
    `${method} ${path} failed: ${extractErrorMessage(response.status, response.statusText, body)}`,
    body
  );
}
