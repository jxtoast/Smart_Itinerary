import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { env, isTruthy, requireEnv } from "./config";
import { AuthClaims, AuthClaimsSchema } from "../dto/auth";

/**
 * JWT verification for Amazon Cognito (diagram: "Amazon Cognito").
 *
 * TOKEN_VERIFY_MODE=cognito — verify against the user pool's JWKS (AWS).
 * TOKEN_VERIFY_MODE=dev     — verify locally-signed HS256 dev tokens, used by
 *                             mock auth (Cypress/offline development).
 *
 * Tokens are accepted from the `Authorization: Bearer` header (Mobile App /
 * Third Party clients on the diagram) or the web session cookie.
 */

const AUTH_COOKIE_NAME = "si_session";

export interface TokenVerifier {
  verify(token: string): Promise<AuthClaims>;
}

export function createTokenVerifier(opts?: { mode?: "cognito" | "dev" }): TokenVerifier {
  const mode = opts?.mode ?? env("TOKEN_VERIFY_MODE", "dev");

  if (mode === "cognito") {
    const issuer = requireEnv("COGNITO_ISSUER"); // https://cognito-idp.<region>.amazonaws.com/<poolId>
    const audience = requireEnv("COGNITO_CLIENT_ID");
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    return {
      async verify(token) {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience });
        return AuthClaimsSchema.parse({
          sub: payload.sub,
          email: typeof payload.email === "string" ? payload.email : undefined,
          name: typeof payload.name === "string" ? payload.name : undefined,
        });
      },
    };
  }

  const secret = new TextEncoder().encode(env("JWT_DEV_SECRET", "dev-only-secret"));
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, secret);
      return AuthClaimsSchema.parse({
        sub: String(payload.sub),
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
      });
    },
  };
}

/** Dev/mock token minting — never used when TOKEN_VERIFY_MODE=cognito. */
export async function signDevToken(claims: AuthClaims, expiresIn = "12h"): Promise<string> {
  if (isTruthy("TOKEN_VERIFY_MODE") && env("TOKEN_VERIFY_MODE") === "cognito") {
    throw new Error("signDevToken must not be used in cognito mode");
  }
  const secret = new TextEncoder().encode(env("JWT_DEV_SECRET", "dev-only-secret"));
  return new SignJWT({ email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/** Structural request shape — keeps @smart/shared free of an express dependency. */
export interface AuthenticatedRequestLike {
  headers: { [name: string]: string | string[] | undefined };
  cookies?: { [name: string]: string | undefined };
  auth?: AuthClaims;
}

export async function extractToken(req: AuthenticatedRequestLike): Promise<string | null> {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  // req.cookies only exists when a service mounts cookie-parser; the gateway
  // does, but the downstream services must not need that extra dependency to
  // re-verify the session (conventions §6). Fall back to the raw header.
  const cookie = req.cookies?.[AUTH_COOKIE_NAME] ?? readSessionCookie(req.headers.cookie);
  return cookie ?? null;
}

/**
 * Pull `si_session` out of a raw `Cookie` header ("a=1; si_session=<jwt>").
 * Only the session cookie's value is of interest here, so a tiny targeted
 * parse beats requiring cookie-parser in every service.
 */
function readSessionCookie(rawHeader: string | string[] | undefined): string | undefined {
  if (typeof rawHeader !== "string") return undefined;
  for (const pair of rawHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const rawValue = pair.slice(separator + 1).trim();
    // Browsers percent-encode cookie values; JWTs use only base64url
    // characters, but decode anyway for robustness (a malformed escape must
    // not crash the request — fall back to the raw value).
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return undefined;
}

/** Throws a 401-shaped error when the request carries no valid token. */
export async function requireClaims(
  verifier: TokenVerifier,
  req: AuthenticatedRequestLike
): Promise<AuthClaims> {
  const token = await extractToken(req);
  if (!token) {
    const error = new Error("Missing authentication token") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  return verifier.verify(token);
}
