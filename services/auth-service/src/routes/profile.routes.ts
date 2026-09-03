/**
 * profile.routes.ts — GET/PATCH /api/auth/profile.
 *
 * GET is the plain profile read (no demographics) for pages that only need
 * identity; PATCH is the display-name / avatar edit backed by the web
 * profile pages (apps/web/app/profile/[userId]/edit-profile in Phase 2).
 * Bodies are validated with the shared zod DTOs — never hand-rolled checks.
 */
import { Router } from "express";
import { ApiError, parseBody, requireClaims, UpdateProfileSchema, UserProfileSchema } from "@smart/shared";
import { asyncHandler } from "../http/async-handler";
import { AuthRouteDeps } from "../deps";

export function createProfileRouter(deps: AuthRouteDeps): Router {
  const router = Router();

  /**
   * GET /api/auth/profile — the caller's own profile row.
   * Response: UserProfileSchema — { id, name, email, avatar_url }.
   */
  router.get(
    "/profile",
    asyncHandler(async (req, res) => {
      const claims = await requireClaims(deps.verifier, req);
      const profile = await deps.users.findById(claims.sub);
      if (!profile) {
        // Possible only when the token is valid but /me was never called
        // (e.g. a row deleted out-of-band) — tell the client how to recover.
        throw ApiError.notFound(
          `No profile row for user ${claims.sub} (call GET /api/auth/me first)`
        );
      }
      res.status(200).json(UserProfileSchema.parse(profile));
    })
  );

  /**
   * PATCH /api/auth/profile — partial update of name / avatar_url.
   * Body: UpdateProfileSchema — { name?, avatar_url? }; omitted fields keep
   * their current value (enforced by COALESCE in the UPDATE). Email is not
   * editable here: Cognito owns it.
   */
  router.patch(
    "/profile",
    asyncHandler(async (req, res) => {
      const claims = await requireClaims(deps.verifier, req);
      // parseBody turns schema violations into a 400 with field details.
      const patch = parseBody(UpdateProfileSchema, req.body);
      const updated = await deps.users.updateProfile(claims.sub, patch);
      if (!updated) {
        throw ApiError.notFound(
          `No profile row for user ${claims.sub} (call GET /api/auth/me first)`
        );
      }
      res.status(200).json(UserProfileSchema.parse(updated));
    })
  );

  return router;
}
