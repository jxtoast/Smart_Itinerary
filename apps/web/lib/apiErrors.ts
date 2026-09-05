/**
 * Turn a failed api-client call into a message the UI can show inline
 * (Phase 2 rewiring, T2.3). Every api-client failure arrives as an
 * `ApiClientError` carrying the HTTP status and the service's JSON error
 * body (`{ error, details? }`) — the server's own wording is the most
 * honest thing to display (e.g. gemini-service's 503 "AI generation
 * unavailable: GEMINI_API_KEY is not configured on the server"), so this
 * helper just unwraps it and adds friendly wording for the no-response case.
 */
import { ApiClientError } from "@smart/api-client";

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const serverMessage =
      typeof error.body === "object" &&
      error.body !== null &&
      "error" in error.body &&
      typeof error.body.error === "string"
        ? error.body.error
        : undefined;
    if (serverMessage) return serverMessage;
    if (error.isNetworkFailure) {
      return "Cannot reach the server — is the API gateway running?";
    }
    return `${fallback} (status ${error.status})`;
  }
  return fallback;
}
