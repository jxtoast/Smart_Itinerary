import { Router } from "express";
import { z } from "zod";
import {
  ApiError,
  SharedItineraryResponseSchema,
  ShareCreateSchema,
  ShareResponseSchema,
  parseBody,
} from "@smart/shared";
import { asyncHandler } from "../http/async-handler";
import { parseParam } from "../http/params";
import { createRequireAuth } from "../http/require-auth";
import { ToolsRouteDeps } from "../deps";
import * as toolsRepository from "../repositories/toolsRepository";
import { generateShareToken } from "../tokens";

/**
 * shares.routes.ts — itinerary sharing (diagram: "Tools Service — Sharing"),
 * mounted at /api/tools/shares by src/app.ts.
 *
 * POST /shares records a share link (share_token in itinerary_shares) and
 * publishes `itinerary.shared` so the email-service notifies the audience —
 * a group's joined members and/or explicit recipient emails. GET /shares/
 * :token resolves such a token back into the read-only itinerary payload for
 * app/shared/[token] (T2.5), fetching the aggregate from the itinerary-
 * service because the itinerary lives in that service's database.
 */
export function createSharesRouter(deps: ToolsRouteDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(deps.verifier);

  /**
   * POST /api/tools/shares — create a share link + notify the audience.
   * Body: ShareCreateSchema ({ itineraryId, groupId? and/or recipientEmails? }).
   * Recipients are the union of the explicit list and the group's joined
   * members (a group with no joined members yet still shares fine — the link
   * works regardless). Responds 201 with ShareResponseSchema
   * ({ shareToken, shareUrl }); the URL points at the web app's read-only
   * /shared/<token> page (WEB_PUBLIC_URL env).
   */
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const request = parseBody(ShareCreateSchema, req.body);

      // Only members may share to a group: existence is checked implicitly by
      // the membership test (unknown/foreign groups both 404 — no leak).
      let groupName: string | undefined;
      let recipients = [...(request.recipientEmails ?? [])];
      if (request.groupId) {
        const group = await toolsRepository.getGroupDtoById(deps.pool, request.groupId);
        if (!group) {
          throw ApiError.notFound(`Group ${request.groupId} not found`);
        }
        const isMember =
          group.ownerUserId === claims.sub ||
          group.members.some(
            (member) => member.userId === claims.sub || member.email === claims.email
          );
        if (!isMember) {
          throw ApiError.notFound(`Group ${request.groupId} not found`);
        }
        groupName = group.name;
        const joinedEmails = await toolsRepository.listJoinedMemberEmails(
          deps.pool,
          request.groupId
        );
        recipients = [...new Set([...recipients, ...joinedEmails])];
      }

      const shareToken = generateShareToken();
      const share = await toolsRepository.createShare(deps.pool, {
        itineraryId: request.itineraryId,
        groupId: request.groupId ?? null,
        shareToken,
        createdBy: claims.sub,
      });

      // Notify through the broker (best-effort — a RabbitMQ outage never
      // fails the share). The itinerary's destination is not fetched here on
      // purpose: sharing must not depend on the itinerary-service being up.
      await deps.events.itineraryShared({
        shareToken,
        itineraryId: share.itinerary_id,
        groupId: share.group_id ?? undefined,
        groupName,
        sharedByEmail: claims.email ?? claims.sub,
        recipientEmails: recipients,
      });

      res.status(201).json(
        ShareResponseSchema.parse({
          shareToken,
          shareUrl: `${deps.webPublicUrl}/shared/${shareToken}`,
        })
      );
    })
  );

  /**
   * GET /api/tools/shares/:token — resolve a share token to the read-only
   * itinerary payload (SharedItineraryResponseSchema). Authenticated callers
   * only (the gateway 401s anonymous traffic anyway); the token scopes the
   * access to exactly this one itinerary — no group membership required, so
   * a recipient who never joined a group can still open their link.
   * 404 for unknown tokens.
   */
  router.get(
    "/:token",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const token = parseParam(z.string().min(1), req.params.token, "share token");

      const share = await toolsRepository.findShareByToken(deps.pool, token);
      if (!share) {
        throw ApiError.notFound("Share link not found");
      }

      // Caller's own credentials forward so itinerary-service sees the same
      // authenticated user (see itineraryClient.ts).
      const itinerary = await deps.itineraryClient(share.itinerary_id, {
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      });

      res.status(200).json(
        SharedItineraryResponseSchema.parse({
          itineraryId: share.itinerary_id,
          sharedAt: new Date(share.created_at).toISOString(),
          itinerary,
        })
      );
    })
  );

  return router;
}
