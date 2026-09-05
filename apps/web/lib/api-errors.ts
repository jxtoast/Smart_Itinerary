/**
 * One readable message out of any error the API-backed pages can hit while
 * talking to the platform API (Phase 2 rewiring — see lib/api.ts).
 *
 * `ApiClientError` carries the HTTP status; status 0 means the request never
 * got a response at all (gateway down / offline), which deserves plainer
 * wording than the raw fetch message. 401 gets a sign-in hint. Anything else
 * (an unexpected bug, a zod contract break) falls back to the Error message.
 */
import { ApiClientError, NETWORK_FAILURE_STATUS } from "@smart/api-client";

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === NETWORK_FAILURE_STATUS) {
      return "Cannot reach the server. Check your connection and try again.";
    }
    if (error.status === 401) {
      return "Your session has expired or you are not signed in. Please sign in again.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
