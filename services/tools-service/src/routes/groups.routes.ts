import { Router } from "express";
import { z } from "zod";
import {
  ApiError,
  GroupCreateSchema,
  JoinGroupSchema,
  MemberInviteSchema,
  parseBody,
} from "@smart/shared";
import { asyncHandler } from "../http/async-handler";
import { parseParam } from "../http/params";
import { createRequireAuth } from "../http/require-auth";
import { ToolsRouteDeps } from "../deps";
import * as toolsRepository from "../repositories/toolsRepository";
import { generateInviteToken } from "../tokens";

/**
 * groups.routes.ts — the Groups API of the Tools Service (diagram:
 * "Tools Service — Sharing"), mounted at /api/tools/groups by src/app.ts.
 *
 * Call path (T2.5 Groups page): web → gateway:8080/api/tools/groups →
 * forwarded path-intact → this router → toolsRepository SQL (tools-db).
 *
 * Invite lifecycle: owner invites an email → row in group_members with a
 * single-use token + `group.invited` event (email-service sends the join
 * link) → invitee POSTs the token to /join → row becomes 'joined', bound to
 * the invitee's user id, token nulled.
 */
export function createGroupsRouter(deps: ToolsRouteDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(deps.verifier);

  /**
   * POST /api/tools/groups — create a group owned by the caller.
   * Body: GroupCreateSchema ({ name }); responds 201 with the shared
   * GroupDtoSchema ({ id, name, ownerUserId, members: [] }).
   */
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const request = parseBody(GroupCreateSchema, req.body);
      const group = await toolsRepository.createGroup(deps.pool, {
        name: request.name,
        ownerUserId: claims.sub,
      });
      res.status(201).json(group);
    })
  );

  /**
   * GET /api/tools/groups — groups the caller owns, has joined, or is invited
   * to (pending invites are matched by the token's email claim). Responds
   * with a bare array of GroupDtoSchema objects — there is no list wrapper
   * contract in @smart/shared, so the array itself is the contract.
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const groups = await toolsRepository.listGroupsVisibleTo(
        deps.pool,
        claims.sub,
        claimsEmail(claims.email)
      );
      res.status(200).json(groups);
    })
  );

  /**
   * POST /api/tools/groups/join — join a group with an emailed invite token.
   * Body: JoinGroupSchema ({ inviteToken }). The token IS the authorization
   * (single use, nulled on success); unknown/used tokens answer 404.
   * Responds 200 with the joined group's GroupDto.
   */
  router.post(
    "/join",
    asyncHandler(async (req, res) => {
      // gateway requires a session anyway — re-check here to stay consistent
      const claims = await requireAuth(req);
      const request = parseBody(JoinGroupSchema, req.body);
      // The single-use guard is inside the UPDATE (see repository): a token
      // used twice answers 404 for whoever came second.
      const member = await toolsRepository.joinMemberByToken(
        deps.pool,
        request.inviteToken,
        claims.sub
      );
      if (!member) {
        throw ApiError.notFound("Invalid or already-used invite token");
      }
      const group = await toolsRepository.getGroupDtoById(deps.pool, member.group_id);
      res.status(200).json(group);
    })
  );

  /**
   * GET /api/tools/groups/:id — one group with its member list. Only visible
   * to owners/members (plus pending invitees, matching the list endpoint);
   * anything else answers 404 so group existence is never leaked.
   */
  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const groupId = parseParam(z.string().uuid(), req.params.id, "group id");
      const group = await toolsRepository.findGroupVisibleTo(
        deps.pool,
        groupId,
        claims.sub,
        claimsEmail(claims.email)
      );
      if (!group) {
        throw ApiError.notFound(`Group ${groupId} not found`);
      }
      res.status(200).json(group);
    })
  );

  /**
   * POST /api/tools/groups/:id/invites — owner invites one email address.
   * Body: MemberInviteSchema ({ email }); responds 201 with the refreshed
   * GroupDto (the new member row carries its inviteToken — see the repository
   * mapping note). 403 for non-owners, 409 when the email is already
   * invited/joined. After the row is stored, `group.invited` is published so
   * email-service can deliver the join link (broker down ≠ failed invite).
   */
  router.post(
    "/:id/invites",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const groupId = parseParam(z.string().uuid(), req.params.id, "group id");
      const request = parseBody(MemberInviteSchema, req.body);

      const group = await toolsRepository.getGroupDtoById(deps.pool, groupId);
      if (!group) {
        throw ApiError.notFound(`Group ${groupId} not found`);
      }
      if (group.ownerUserId !== claims.sub) {
        throw new ApiError(403, "Only the group owner can invite members");
      }
      const existing = await toolsRepository.findMemberByEmail(deps.pool, groupId, request.email);
      if (existing) {
        throw new ApiError(
          409,
          `${request.email} is already ${existing.status} in this group`
        );
      }

      const inviteToken = generateInviteToken();
      try {
        await toolsRepository.insertInvitedMember(deps.pool, {
          groupId,
          email: request.email,
          inviteToken,
        });
      } catch (error) {
        // The pre-check above keeps the common case a clean 409, but two
        // concurrent invites could both pass it — the UNIQUE (group_id, email)
        // constraint then rejects the loser (pg code 23505). Map that to the
        // same 409 instead of a 500.
        if ((error as { code?: string }).code === "23505") {
          throw new ApiError(409, `${request.email} is already invited or joined in this group`);
        }
        throw error;
      }
      await deps.events.groupInvited({
        groupId,
        groupName: group.name,
        email: request.email,
        inviteToken,
        // Dev tokens may omit the email claim; fall back to the user id so
        // the notification still has a "who" (display-only in the email).
        invitedByEmail: claims.email ?? claims.sub,
      });

      const refreshed = await toolsRepository.getGroupDtoById(deps.pool, groupId);
      res.status(201).json(refreshed);
    })
  );

  /**
   * DELETE /api/tools/groups/:id — owner deletes the group; members cascade
   * (ON DELETE CASCADE) and shares keep their tokens with group_id NULL
   * (ON DELETE SET NULL, both in the DDL). Non-owners/unknown ids → 404.
   */
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const groupId = parseParam(z.string().uuid(), req.params.id, "group id");
      const deletedId = await toolsRepository.deleteGroupIfOwner(deps.pool, groupId, claims.sub);
      if (!deletedId) {
        throw ApiError.notFound(`Group ${groupId} not found`);
      }
      res.status(200).json({ message: `Group ${groupId} deleted successfully` });
    })
  );

  return router;
}

/** The visibility/email predicates tolerate dev tokens without an email claim. */
function claimsEmail(email: string | undefined): string {
  return email ?? "";
}
