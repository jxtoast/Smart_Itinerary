/**
 * Server-side helpers for the Cognito hosted-UI auth flow (diagram: "Amazon
 * Cognito"). The whole sign-in is a server-side handoff:
 *
 *   /auth (page)      → /auth/start (route handler) → Cognito hosted UI
 *   Cognito → /auth/callback (route handler) → code+PKCE exchange → si_session
 *   /auth/signout (route handler) → clear cookie → Cognito end-session
 *
 * PKCE secrets and tokens therefore never enter browser JavaScript — the only
 * cookies the browser sees are httpOnly. The Cognito DOMAIN and CLIENT_ID are
 * public config but live in plain server env vars anyway, since no client
 * code needs them.
 */
import "server-only";

import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

/** Session cookie the gateway's JWT gate reads — kept in sync by convention
 * with AUTH_COOKIE_NAME in packages/shared/src/adapters/jwt.ts and the
 * gateway's dev-token route. Holds the Cognito id_token (or a dev token). */
export const SI_SESSION_COOKIE = "si_session";

/** Transient sign-in cookies — one value each, cleared by the callback. */
export const PKCE_VERIFIER_COOKIE = "si_pkce_verifier";
export const AUTH_STATE_COOKIE = "si_auth_state";
export const AUTH_NEXT_COOKIE = "si_auth_next";

/** Sign-in handoff cookies are single-use: 10 minutes to finish the redirect. */
export const AUTH_HANDOFF_TTL_SECONDS = 600;

/** Cognito id_tokens default to 1h (set on the app client in infra/cognito). */
export const SESSION_FALLBACK_TTL_SECONDS = 3600;

const AUTH_SCOPES = "openid email profile";

/** Same flags for every auth cookie: browser JS never reads them, and `lax`
 * lets them ride on the top-level GET navigations of the redirect dance. */
export function authCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // localhost sign-in is plain http; behind the ALB (production) it is https.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Expires a cookie on the browser (empty value + maxAge 0). */
export function clearCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, "", authCookieOptions(0));
}

export interface CognitoConfig {
  /** Hosted UI base URL, e.g. https://smart-itinerary-x.auth.ap-southeast-1.amazoncognito.com */
  hostedUiDomain: string;
  clientId: string;
}

/** Reads the pool config produced by infra/cognito; null = not configured,
 * which the routes turn into an honest "sign-in not configured" page. */
export function readCognitoConfig(): CognitoConfig | null {
  const hostedUiDomain = process.env.COGNITO_HOSTED_UI_DOMAIN?.replace(/\/+$/, "");
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!hostedUiDomain || !clientId) return null;
  return { hostedUiDomain, clientId };
}

/** RFC 7636 PKCE pair: random high-entropy verifier + its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url"); // 43 chars — RFC minimum
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Reduces a post-sign-in redirect target to a same-origin path. Callers pass
 * their current URL (e.g. window.location.href); a hostile or malformed value
 * can only ever produce a path on our own site — never an external redirect.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, "https://same-origin.invalid");
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return "/";
  }
}

/** The OAuth client that Cognito federation calls back to: /auth/callback. */
export function callbackUrl(requestOrigin: string): string {
  return `${requestOrigin}/auth/callback`;
}

/** Cognito hosted-UI URL that starts the authorization-code + PKCE flow. */
export function buildAuthorizeUrl(
  config: CognitoConfig,
  params: { redirectUri: string; state: string; codeChallenge: string }
): string {
  const authorize = new URL(`${config.hostedUiDomain}/oauth2/authorize`);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", params.redirectUri);
  authorize.searchParams.set("state", params.state);
  authorize.searchParams.set("scope", AUTH_SCOPES);
  authorize.searchParams.set("code_challenge", params.codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  // Google is the pool's only IdP (infra/cognito) — skip the account-picker
  // step and hand the user straight to Google's consent screen.
  authorize.searchParams.set("identity_provider", "GOOGLE");
  return authorize.toString();
}

export interface CognitoTokens {
  idToken: string;
  expiresInSeconds: number;
}

/**
 * Exchanges the authorization code for tokens at Cognito's token endpoint
 * (server-side fetch — the code_verifier never leaves the server). Returns
 * only what the session cookie needs: the id_token and its lifetime.
 */
export async function exchangeCodeForTokens(
  config: CognitoConfig,
  params: { code: string; codeVerifier: string; redirectUri: string }
): Promise<CognitoTokens> {
  const response = await fetch(`${config.hostedUiDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "<no body>");
    throw new Error(
      `Cognito token exchange failed (${response.status}): ${detail.slice(0, 300)}`
    );
  }

  // Minimal narrowing of the well-known token payload (unknown → checked):
  // the session cookie needs exactly id_token + expires_in.
  const body: unknown = await response.json();
  const idToken = pickString(body, "id_token");
  if (!idToken) {
    throw new Error("Cognito token response is missing id_token");
  }
  const expiresIn = pickNumber(body, "expires_in") ?? SESSION_FALLBACK_TTL_SECONDS;
  return { idToken, expiresInSeconds: expiresIn };
}

function pickString(body: unknown, key: string): string | undefined {
  if (typeof body === "object" && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function pickNumber(body: unknown, key: string): number | undefined {
  if (typeof body === "object" && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * HTML error page for sign-in failures. The legacy callback redirected to a
 * nonexistent /auth/auth-code-error page; an inline page keeps the failure
 * readable (what went wrong + the most likely fix) and avoids redirect loops
 * through /auth, which forwards to the hosted UI.
 */
export function authErrorPage(title: string, detail: string): NextResponse {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Sign-in failed</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto;">
    <h1>Sign-in failed</h1>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p>${escapeHtml(detail)}</p>
    <p><a href="/">Back to Smart Itinerary</a></p>
  </body>
</html>`;
  return new NextResponse(html, {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
