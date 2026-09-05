/**
 * GET /auth/signout — ends the web session (diagram: "Amazon Cognito").
 * Clears the si_session cookie server-side (it is httpOnly, so browser JS —
 * including AuthContext — cannot), then redirects to Cognito's end-session
 * endpoint so the hosted-UI SSO session dies with it. Mock mode simply goes
 * home; without a pool config, clearing the cookie is all there is to do
 * (dev-token sessions only live in that cookie).
 */
import { NextRequest, NextResponse } from "next/server";
import { isMockModeEnabled } from "@smart/api-client";
import {
  AUTH_NEXT_COOKIE,
  AUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  SI_SESSION_COOKIE,
  clearCookie,
  readCognitoConfig,
} from "@/lib/auth/cognito";

export async function GET(request: NextRequest) {
  const config = readCognitoConfig();
  const cognitoMode = !isMockModeEnabled() && config !== null;

  // Cognito /logout revokes the hosted-UI session too — without it the next
  // sign-in would silently re-authenticate the same Google account. In mock
  // mode (or with no pool configured) just go home with the cookie cleared.
  const destination = new URL("/", request.url);
  if (cognitoMode && config) {
    const logoutUrl = new URL(`${config.hostedUiDomain}/logout`);
    logoutUrl.searchParams.set("client_id", config.clientId);
    logoutUrl.searchParams.set("logout_uri", `${request.nextUrl.origin}/`);
    destination.href = logoutUrl.toString();
  }

  const response = NextResponse.redirect(destination);
  clearCookie(response, SI_SESSION_COOKIE);
  // Leftovers from an abandoned sign-in, if any.
  clearCookie(response, PKCE_VERIFIER_COOKIE);
  clearCookie(response, AUTH_STATE_COOKIE);
  clearCookie(response, AUTH_NEXT_COOKIE);
  return response;
}
