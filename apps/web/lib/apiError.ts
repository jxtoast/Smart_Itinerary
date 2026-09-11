/**
 * Friendly inline error text for the typed API client (T2.5 tools UI).
 *
 * Pages render `ApiClientError`s as inline panels instead of crashing —
 * this helper maps the error's HTTP status to a sentence a first-time user
 * understands. Where the service already sends a specific, human message
 * (403 "Only the group owner can…", 404 "Group g-1 not found", 409 "already
 * invited") that message is shown as-is; generic statuses get a fixed text.
 */
import { ApiClientError } from "@smart/api-client";

/** Map any thrown value to one readable line for an inline error panel. */
export function describeApiClientError(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    // Non-API throw (a bug, a rejected promise) — still show something honest.
    return error instanceof Error ? `Something went wrong: ${error.message}` : "Something went wrong.";
  }

  if (error.isNetworkFailure) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error.status === 401) {
    return "Your session has expired or you are signed out. Please sign in again.";
  }
  if (error.status === 400) {
    return error.message || "The request was not valid.";
  }
  // 403/404/409 carry specific service messages — surface them verbatim.
  if (error.message) {
    return error.message;
  }
  return `Request failed with status ${error.status}.`;
}
