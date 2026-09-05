/**
 * GET /auth/callback — Cognito redirects here after sign-in (diagram:
 * "Amazon Cognito"). Verifies the CSRF state cookie, exchanges the
 * authorization code for tokens at Cognito's token endpoint using the PKCE
 * verifier from the httpOnly cookie, and puts the Cognito id_token into the
 * si_session cookie — the same httpOnly cookie the gateway's JWT gate reads
 * (packages/shared/src/adapters/jwt.ts). Then back to where the user was.
 * Replaces the legacy Supabase code exchange that lived here before.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_NEXT_COOKIE,
  AUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  SI_SESSION_COOKIE,
  authCookieOptions,
  authErrorPage,
  callbackUrl,
  clearCookie,
  exchangeCodeForTokens,
  readCognitoConfig,
  sanitizeNextPath,
} from "@/lib/auth/cognito";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Cognito signals failures by redirecting back with error params.
  const oauthError = params.get("error");
  if (oauthError) {
    return authErrorPage(
      `Cognito returned "${oauthError}"`,
      params.get("error_description") ??
        "Sign-in was cancelled or failed at Cognito. Retry from the home page."
    );
  }

  const config = readCognitoConfig();
  const code = params.get("code");
  const state = params.get("state");
  const codeVerifier = request.cookies.get(PKCE_VERIFIER_COOKIE)?.value;
  const issuedState = request.cookies.get(AUTH_STATE_COOKIE)?.value;
  const next = sanitizeNextPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value);

  if (!config || !code || !state || !codeVerifier || !issuedState) {
    return authErrorPage(
      "Incomplete sign-in response",
      "The callback is missing the code, state, or the transient sign-in " +
        "cookies. Retry from the home page — and make sure this origin is " +
        "registered in the pool's callback_urls (infra/cognito)."
    );
  }
  // CSRF guard: the state coming back must be the one we handed out.
  if (state !== issuedState) {
    return authErrorPage(
      "State mismatch",
      "The sign-in response does not match the request we sent (stale tab " +
        "or forged callback). Retry from the home page."
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(config, {
      code,
      codeVerifier,
      redirectUri: callbackUrl(request.nextUrl.origin),
    });

    const response = NextResponse.redirect(new URL(next, request.url));
    // Session cookie = the Cognito id_token: it carries sub/email/name (what
    // auth-service upserts) and its aud matches the app client the gateway
    // verifies against. TTL follows the token's remaining lifetime.
    response.cookies.set(
      SI_SESSION_COOKIE,
      tokens.idToken,
      authCookieOptions(tokens.expiresInSeconds)
    );
    clearCookie(response, PKCE_VERIFIER_COOKIE);
    clearCookie(response, AUTH_STATE_COOKIE);
    clearCookie(response, AUTH_NEXT_COOKIE);
    return response;
  } catch (error) {
    console.error(
      { event: "cognito_callback_failed", message: (error as Error).message }
    );
    return authErrorPage(
      "Token exchange with Cognito failed",
      (error as Error).message
    );
  }
}
