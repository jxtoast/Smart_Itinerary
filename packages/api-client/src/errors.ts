/**
 * Error typing for the browser API client.
 *
 * Every non-2xx response (and every network-level failure) is surfaced as an
 * `ApiClientError` so UI code can `instanceof`-check and branch on the status
 * instead of string-matching messages. The `body`/`details` fields carry the
 * gateway's/service's JSON error shape (`{ error, details? }` — see
 * `@smart/shared` errorHandler), e.g. zod 400 details for form hints.
 */

/** Status used when the request never got an HTTP response (gateway down, offline, CORS). */
export const NETWORK_FAILURE_STATUS = 0;

export class ApiClientError extends Error {
  /** HTTP status; `0` (NETWORK_FAILURE_STATUS) when no response arrived at all. */
  readonly status: number;
  /** The parsed JSON error body as-is, or `undefined` for network failures. */
  readonly body: unknown;
  /** Convenience accessor for `body.details` (the zod field errors on 400s). */
  readonly details: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
    this.details = isRecord(body) && "details" in body ? body.details : undefined;
  }

  /** True when the request failed before any HTTP response existed. */
  get isNetworkFailure(): boolean {
    return this.status === NETWORK_FAILURE_STATUS;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Best-effort message extraction from an error body the backends actually send. */
export function extractErrorMessage(status: number, statusText: string, body: unknown): string {
  // Services answer `{ error: string, details? }` — details only on 400s.
  const message = isRecord(body) ? body.error : undefined;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  // Non-JSON error pages (proxy 502s etc.) still deserve a readable message.
  return statusText || `Request failed with status ${status}`;
}
