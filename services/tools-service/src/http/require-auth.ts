import { Request } from "express";
import { ApiError, AuthClaims, TokenVerifier, requireClaims } from "@smart/shared/src/server";

/**
 * require-auth.ts — requireClaims with invalid/expired tokens reported as 401.
 *
 * The shared verifier already throws a 401-shaped error for a MISSING token;
 * a token that fails verification surfaces as a raw jose error (its `code`
 * starts with ERR_JWS or ERR_JWT), which would otherwise be misreported as a
 * 500. Anything else (e.g. an unreachable Cognito JWKS endpoint) keeps its
 * real status. Shared by all three routers so the wording stays consistent.
 */
export function createRequireAuth(verifier: TokenVerifier) {
  return async function requireAuth(req: Request): Promise<AuthClaims> {
    try {
      return await requireClaims(verifier, req);
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code.startsWith("ERR_JWS") || code.startsWith("ERR_JWT")) {
        throw ApiError.unauthorized("Invalid authentication token");
      }
      throw error;
    }
  };
}
