import type { Pool } from "pg";
import { GroupDto, GroupDtoSchema, query, queryOne } from "@smart/shared";

/**
 * Tools Service repository — every SQL statement of this service lives here
 * (diagram: "Amazon RDS (Tools DB)"; locally the tools-db container, DDL in
 * db/init/tools-service.sql).
 *
 * Tables owned (matching that DDL):
 *   groups           — a named trip-planning group with one owner
 *   group_members    — invited/joined peers (unique per group+email, carries
 *                      the single-use invite_token until it is used)
 *   itinerary_shares — one row per share link (share_token → itinerary)
 *   pdf_exports      — audit trail of generated PDFs (storage_key in MinIO/S3)
 *
 * Row shapes here are snake_case exactly as Postgres returns them; the
 * camelCase API shape (GroupDto from @smart/shared) is produced by
 * mapGroupToDto, which also runs the shared zod schema as an outgoing
 * contract check — a mapping bug fails loudly instead of shipping bad JSON.
 */

// ---------------------------------------------------------------------------
// Row types — one per table, snake_case as Postgres returns them.
// Type aliases (not interfaces) so they satisfy pg's QueryResultRow index
// signature.
// ---------------------------------------------------------------------------

type GroupRow = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: Date | string;
};

type GroupMemberRow = {
  id: string | number;
  group_id: string;
  email: string;
  /** Set once the invitee joins; null while the membership is just an email. */
  user_id: string | null;
  status: "invited" | "joined";
  /** Single-use: nulled by joinMember after a successful join. */
  invite_token: string | null;
  invited_at: Date | string;
  joined_at: Date | string | null;
};

type ItineraryShareRow = {
  id: string | number;
  itinerary_id: string;
  /** Null for direct-email shares that were not made to a group. */
  group_id: string | null;
  share_token: string;
  created_by: string;
  created_at: Date | string;
};

type PdfExportRow = {
  id: string | number;
  itinerary_id: string;
  storage_key: string;
  created_by: string | null;
  created_at: Date | string;
};

/** Same shape as the SELECTs below — keeps the column list in one place. */
const MEMBER_COLUMNS =
  "id, group_id, email, user_id, status, invite_token, invited_at, joined_at";

// ---------------------------------------------------------------------------
// Mapping — Postgres rows to the shared camelCase DTOs.
// ---------------------------------------------------------------------------

/**
 * Map a group + its member rows to the shared GroupDto contract.
 *
 * inviteToken is included on each member row on purpose: the token is the
 * join capability and this is a demo-grade group tool — exposing it to group
 * members lets the join flow be exercised without a reachable email-service.
 * The production path is the emailed link (group.invited event → email-service).
 */
function mapGroupToDto(group: GroupRow, members: GroupMemberRow[]): GroupDto {
  return GroupDtoSchema.parse({
    id: group.id,
    name: group.name,
    ownerUserId: group.owner_user_id,
    members: members.map((member) => ({
      email: member.email,
      status: member.status,
      userId: member.user_id,
      inviteToken: member.invite_token,
    })),
  });
}

/** A group plus its member rows → DTO. Unknown ids return null. */
export async function getGroupDtoById(pool: Pool, groupId: string): Promise<GroupDto | null> {
  const group = await queryOne<GroupRow>(
    pool,
    `SELECT id, name, owner_user_id, created_at FROM groups WHERE id = $1`,
    [groupId]
  );
  if (!group) return null;
  return mapGroupToDto(group, await listMembers(pool, groupId));
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** Create a group. The creating user becomes its owner; a new group has no member rows yet. */
export async function createGroup(
  pool: Pool,
  input: { name: string; ownerUserId: string }
): Promise<GroupDto> {
  const group = await queryOne<GroupRow>(
    pool,
    `INSERT INTO groups (name, owner_user_id) VALUES ($1, $2)
     RETURNING id, name, owner_user_id, created_at`,
    [input.name, input.ownerUserId]
  );
  return mapGroupToDto(group as GroupRow, []);
}

/**
 * Visibility predicate shared by the list and detail endpoints: a user sees a
 * group when they own it, joined it, or have a pending invite on their email
 * (so an invitee can watch the group before using their token). An empty
 * email (dev tokens may omit the claim) simply matches nothing.
 */
const VISIBLE_TO_PREDICATE = `
  WHERE (g.owner_user_id = $1
     OR EXISTS (SELECT 1 FROM group_members m
                WHERE m.group_id = g.id AND m.user_id = $1)
     OR ($2 <> '' AND EXISTS (SELECT 1 FROM group_members m
                              WHERE m.group_id = g.id AND m.email = $2
                                AND m.status = 'invited')))`;

/** All groups the user owns, has joined, or is invited to, newest first. */
export async function listGroupsVisibleTo(
  pool: Pool,
  userId: string,
  email: string
): Promise<GroupDto[]> {
  // One members query per group — fine at demo scale and much easier to read
  // than a json_agg group-up query; swap it out if groups grow large.
  const groups = await query<GroupRow>(
    pool,
    `SELECT g.id, g.name, g.owner_user_id, g.created_at
     FROM groups g
     ${VISIBLE_TO_PREDICATE}
     ORDER BY g.created_at DESC`,
    [userId, email]
  );
  return Promise.all(
    groups.map(async (group) => mapGroupToDto(group, await listMembers(pool, group.id)))
  );
}

/** One visible group by id (same predicate), or null when absent/not visible. */
export async function findGroupVisibleTo(
  pool: Pool,
  groupId: string,
  userId: string,
  email: string
): Promise<GroupDto | null> {
  const group = await queryOne<GroupRow>(
    pool,
    `SELECT g.id, g.name, g.owner_user_id, g.created_at
     FROM groups g
     ${VISIBLE_TO_PREDICATE} AND g.id = $3`,
    [userId, email, groupId]
  );
  if (!group) return null;
  return mapGroupToDto(group, await listMembers(pool, groupId));
}

/**
 * Delete a group, but only for its owner. Returns the deleted id, or null
 * when the group does not exist OR the caller is not the owner (both surface
 * as 404 — the route never reveals other people's groups).
 * Shares survive with group_id NULL (ON DELETE SET NULL in the DDL).
 */
export async function deleteGroupIfOwner(
  pool: Pool,
  groupId: string,
  ownerId: string
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    pool,
    `DELETE FROM groups WHERE id = $1 AND owner_user_id = $2 RETURNING id`,
    [groupId, ownerId]
  );
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Group members (invites + joins)
// ---------------------------------------------------------------------------

/** All member rows of a group, oldest invite first. */
export async function listMembers(pool: Pool, groupId: string): Promise<GroupMemberRow[]> {
  return query<GroupMemberRow>(
    pool,
    `SELECT ${MEMBER_COLUMNS}
     FROM group_members WHERE group_id = $1 ORDER BY invited_at`,
    [groupId]
  );
}

/**
 * Existing membership for a group+email pair, or null. Used by the invite
 * route to answer 409 instead of letting the UNIQUE (group_id, email)
 * constraint explode into a 500.
 */
export async function findMemberByEmail(
  pool: Pool,
  groupId: string,
  email: string
): Promise<GroupMemberRow | null> {
  return queryOne<GroupMemberRow>(
    pool,
    `SELECT ${MEMBER_COLUMNS}
     FROM group_members WHERE group_id = $1 AND email = $2`,
    [groupId, email]
  );
}

/** Insert an invited member carrying its single-use invite token. */
export async function insertInvitedMember(
  pool: Pool,
  input: { groupId: string; email: string; inviteToken: string }
): Promise<GroupMemberRow> {
  return queryOne<GroupMemberRow>(
    pool,
    `INSERT INTO group_members (group_id, email, status, invite_token)
     VALUES ($1, $2, 'invited', $3)
     RETURNING ${MEMBER_COLUMNS}`,
    [input.groupId, input.email, input.inviteToken]
  ) as Promise<GroupMemberRow>;
}

/**
 * Consume the invite: mark joined, bind the joining user's id, null the token
 * (single use). The guard lives INSIDE the UPDATE — `WHERE invite_token = $1
 * AND status = 'invited'` — so two concurrent joins with the same token
 * cannot both win: Postgres serializes them and the loser updates 0 rows,
 * which the route answers with 404. Returns the updated row, or null when
 * the token is unknown/already used.
 */
export async function joinMemberByToken(
  pool: Pool,
  inviteToken: string,
  userId: string
): Promise<GroupMemberRow | null> {
  return queryOne<GroupMemberRow>(
    pool,
    `UPDATE group_members
     SET status = 'joined', user_id = $2, joined_at = now(), invite_token = NULL
     WHERE invite_token = $1 AND status = 'invited'
     RETURNING ${MEMBER_COLUMNS}`,
    [inviteToken, userId]
  );
}

/** Emails of members who actually joined — the audience of share emails. */
export async function listJoinedMemberEmails(pool: Pool, groupId: string): Promise<string[]> {
  const rows = await query<{ email: string }>(
    pool,
    `SELECT email FROM group_members WHERE group_id = $1 AND status = 'joined'`,
    [groupId]
  );
  return rows.map((row) => row.email);
}

// ---------------------------------------------------------------------------
// Itinerary shares
// ---------------------------------------------------------------------------

/** Persist one share link. group_id is null for direct-email shares. */
export async function createShare(
  pool: Pool,
  input: {
    itineraryId: string;
    groupId: string | null;
    shareToken: string;
    createdBy: string;
  }
): Promise<ItineraryShareRow> {
  return queryOne<ItineraryShareRow>(
    pool,
    `INSERT INTO itinerary_shares (itinerary_id, group_id, share_token, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, itinerary_id, group_id, share_token, created_by, created_at`,
    [input.itineraryId, input.groupId, input.shareToken, input.createdBy]
  ) as Promise<ItineraryShareRow>;
}

/** The share a read-only view token resolves to, or null when unknown. */
export async function findShareByToken(
  pool: Pool,
  shareToken: string
): Promise<ItineraryShareRow | null> {
  return queryOne<ItineraryShareRow>(
    pool,
    `SELECT id, itinerary_id, group_id, share_token, created_by, created_at
     FROM itinerary_shares WHERE share_token = $1`,
    [shareToken]
  );
}

// ---------------------------------------------------------------------------
// PDF exports
// ---------------------------------------------------------------------------

/** Audit row for a generated PDF (storage_key points into MinIO/S3). */
export async function recordPdfExport(
  pool: Pool,
  input: { itineraryId: string; storageKey: string; createdBy: string | null }
): Promise<PdfExportRow> {
  return queryOne<PdfExportRow>(
    pool,
    `INSERT INTO pdf_exports (itinerary_id, storage_key, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, itinerary_id, storage_key, created_by, created_at`,
    [input.itineraryId, input.storageKey, input.createdBy]
  ) as Promise<PdfExportRow>;
}
