/**
 * GET /auth/start — begins sign-in (diagram: "Amazon Cognito").
 * Called by /auth and the sign-in server actions. Generates the PKCE pair and
 * CSRF state, stashes them in short-lived httpOnly cookies (single-use, 10
 * minutes), and 302s the browser to the Cognito hosted UI (authorization code
 * + S256 code challenge). Mock mode just goes home — no pool involved.
 */
import { NextRequest, NextResponse } from "next/server";
import { isMockModeEnabled } from "@smart/api-client";
import {
  AUTH_HANDOFF_TTL_SECONDS,
  AUTH_NEXT_COOKIE,
  AUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  authCookieOptions,
  authErrorPage,
  buildAuthorizeUrl,
  callbackUrl,
  createPkcePair,
  randomToken,
  readCognitoConfig,
  sanitizeNextPath,
} from "@/lib/auth/cognito";

export async function GET(request: NextRequest) {
  // Mock auth (Cypress/offline) has no hosted UI — sign-in is a no-op.
  if (isMockModeEnabled()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const config = readCognitoConfig();
  if (!config) {
    return authErrorPage(
      "Cognito is not configured",
      "The web app is missing COGNITO_HOSTED_UI_DOMAIN / COGNITO_CLIENT_ID. " +
        "Create a pool with infra/cognito (see its RUNBOOK.md), or run with " +
        "NEXT_PUBLIC_ENABLE_MOCK_AUTH=true for offline mock auth."
    );
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomToken();
  // Remember where the user was (ItineraryForm/ItineraryTimeline pass their
  // URL) so /auth/callback can return them after sign-in.
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  const response = NextResponse.redirect(
    buildAuthorizeUrl(config, {
      redirectUri: callbackUrl(request.nextUrl.origin),
      state,
      codeChallenge: challenge,
    })
  );
  response.cookies.set(
    PKCE_VERIFIER_COOKIE,
    verifier,
    authCookieOptions(AUTH_HANDOFF_TTL_SECONDS)
  );
  response.cookies.set(
    AUTH_STATE_COOKIE,
    state,
    authCookieOptions(AUTH_HANDOFF_TTL_SECONDS)
  );
  response.cookies.set(
    AUTH_NEXT_COOKIE,
    next,
    authCookieOptions(AUTH_HANDOFF_TTL_SECONDS)
  );
  return response;
}
