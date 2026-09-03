/**
 * me.routes.ts — GET /api/auth/me.
 *
 * Called by the web AuthContext after login (via the gateway, which proxies
 * /api/auth/* to this service path-preservingly) and by any client holding a
 * Cognito (or dev) JWT. Response contract: MeResponseSchema from
 * @smart/shared — { user: { …profile, userDemographics } }.
 */
import { Router } from "express";
import { MeResponseSchema, requireClaims } from "@smart/shared";
import { asyncHandler } from "../http/async-handler";
import { AuthRouteDeps } from "../deps";

export function createMeRouter(deps: AuthRouteDeps): Router {
  const router = Router();

  /**
   * GET /api/auth/me — current user's profile + demographics.
   * Auth: Bearer token (or forwarded session token) — verified here even
   * though the gateway already checked, because we own the data.
   *
   * The upsert makes this the "first call after login": the users row is
   * created from the token's sub/email/name claims (Cognito is the source
   * of truth for identity) or refreshed if claims changed. Demographics are
   * null until the user saves preferences — that is expected, not an error.
   */
  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      const claims = await requireClaims(deps.verifier, req);
      const profile = await deps.users.upsertFromClaims(claims);
      const demographics = await deps.demographics.findByUserId(claims.sub);

      // Outgoing parse: guarantees the response matches the shared contract;
      // a mismatch is a programmer error and fails loudly (500) in dev.
      const body = MeResponseSchema.parse({
        user: { ...profile, userDemographics: demographics ?? null },
      });
      res.status(200).json(body);
    })
  );

  return router;
}
