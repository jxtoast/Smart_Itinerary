/**
 * GET /auth/start — begins sign-in (diagram: "Amazon Cognito").
 * Called by /auth and the sign-in server actions. Generates the PKCE pair and
 * CSRF state, stashes them in short-lived httpOnly cookies (single-use, 10
 * minutes), and 302s the browser to the Cognito hosted UI (authorization code
 * + S256 code challenge). Mock mode just goes home — no pool involved.
 */
import { NextRequest, NextResponse } from "next/server";
import { isMockModeEnabled } from "@smart/api-client";
import { signDevToken } from "@smart/shared/src/adapters/jwt";
import {
  AUTH_HANDOFF_TTL_SECONDS,
  AUTH_NEXT_COOKIE,
  AUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  SESSION_FALLBACK_TTL_SECONDS,
  SI_SESSION_COOKIE,
  authCookieOptions,
  buildAuthorizeUrl,
  callbackUrl,
  createPkcePair,
  randomToken,
  readCognitoConfig,
  sanitizeNextPath,
} from "@/lib/auth/cognito";

/** The seeded auth-db user — lets /me resolve a profile during dev sign-in. */
const LOCAL_DEV_USER_ID = "1b9472e1-a85e-43bf-9898-6f44e2b20809";

export async function GET(request: NextRequest) {
  // Mock auth (Cypress/offline) has no hosted UI — sign-in is a no-op.
  if (isMockModeEnabled()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const config = readCognitoConfig();
  if (!config) {
    // No pool configured → we are running locally ($0 stack, Cognito never
    // provisioned). Sign the visitor in with a dev token instead: the exact
    // HS256 JWT the gateway and services verify under TOKEN_VERIFY_MODE=dev
    // (shared signDevToken, JWT_DEV_SECRET). The sub matches the seeded
    // auth-db user so /me resolves a real profile. A real deployment always
    // sets the COGNITO_* env vars, so this branch is dev-only in practice.
    const token = await signDevToken({
      sub: LOCAL_DEV_USER_ID,
      email: "testuser@example.com",
      name: "Test User",
    });
    const response = NextResponse.redirect(
      new URL(sanitizeNextPath(request.nextUrl.searchParams.get("next")), request.url)
    );
    response.cookies.set(
      SI_SESSION_COOKIE,
      token,
      authCookieOptions(SESSION_FALLBACK_TTL_SECONDS)
    );
    return response;
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
