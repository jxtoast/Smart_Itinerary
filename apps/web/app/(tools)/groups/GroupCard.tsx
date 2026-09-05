"use client";
/**
 * GroupCard (T2.5 tools UI) — one group on the Groups page.
 *
 * Shows the member list with each member's invite/join status. The tools
 * service carries every invited member's single-use `inviteToken` inside the
 * group payload, so the page displays it with a copy button — the production
 * path is the emailed join link (email-service), but showing the token lets
 * the join flow be exercised without a mail server. Owners can invite by
 * email and delete the group right on the card.
 */
import { useState } from "react";
// Contracts via subpaths, not the @smart/shared barrel — the barrel re-exports
// server adapters whose Node builtins can't resolve in the browser bundle
// (see packages/api-client/src/client.ts).
import { MemberInviteSchema } from "@smart/shared/src/dto/tools";
import type { GroupDto } from "@smart/shared/src/dto/tools";
import { getSessionApiClient } from "@/lib/apiClientSession";
import { describeApiClientError } from "@/lib/apiError";
import CopyButton from "@/components/tools/CopyButton";

/** A member row of GroupDto.members[] (inviteToken arrives as a passthrough field). */
type GroupMember = GroupDto["members"][number];

interface GroupCardProps {
  group: GroupDto;
  currentUserId: string;
  currentUserEmail: string;
  /** Replace this group in the parent's list after a successful invite. */
  onGroupChanged: (updated: GroupDto) => void;
  /** Remove this group from the parent's list after a successful delete. */
  onGroupDeleted: (groupId: string) => void;
}

/** Pull the single-use invite token out of the passthrough member fields. */
function readInviteToken(member: GroupMember): string | null {
  const token = member.inviteToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/**
 * This viewer's role in the group: the owner, a joined member, or someone who
 * is still just invited (the list includes all three — matching is by user id
 * or email, exactly like tools-service's visibility check).
 */
function resolveViewerRole(
  group: GroupDto,
  currentUserId: string,
  currentUserEmail: string
): "owner" | "member" | "invited" {
  if (group.ownerUserId === currentUserId) {
    return "owner";
  }
  const ownMembership = group.members.find(
    (member) => member.userId === currentUserId || member.email === currentUserEmail
  );
  return ownMembership?.status === "joined" ? "member" : "invited";
}

/** Role label + badge colour for the card header. */
const ROLE_BADGES: Record<"owner" | "member" | "invited", { label: string; className: string }> = {
  owner: { label: "Owner", className: "badge-primary" },
  member: { label: "Member", className: "badge-success" },
  invited: { label: "Invited", className: "badge-warning" },
};

export default function GroupCard({
  group,
  currentUserId,
  currentUserEmail,
  onGroupChanged,
  onGroupDeleted,
}: GroupCardProps) {
  const isOwner = resolveViewerRole(group, currentUserId, currentUserEmail) === "owner";
  const roleBadge = ROLE_BADGES[resolveViewerRole(group, currentUserId, currentUserEmail)];
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    // Validate against the shared contract here so an invalid email is a
    // friendly inline message instead of a thrown ZodError.
    const parsed = MemberInviteSchema.safeParse({ email: inviteEmail.trim() });
    if (!parsed.success) {
      setError("Enter a valid email address to invite.");
      return;
    }
    setInviting(true);
    setError(null);
    try {
      const updated = await getSessionApiClient().tools.inviteMember(group.id, parsed.data);
      onGroupChanged(updated);
      setInviteEmail("");
    } catch (caught) {
      setError(describeApiClientError(caught));
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete() {
    // Deleting cascades to the member rows — make the owner confirm first.
    if (!window.confirm(`Delete the group "${group.name}"? Its members lose access.`)) {
      return;
    }
    setError(null);
    try {
      await getSessionApiClient().tools.deleteGroup(group.id);
      onGroupDeleted(group.id);
    } catch (caught) {
      setError(describeApiClientError(caught));
    }
  }

  return (
    <div className="card bg-main-2 shadow-md">
      <div className="card-body p-5 gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title text-lg text-black">{group.name}</h3>
          <div className="flex items-center gap-2">
            <span className={`badge ${roleBadge.className}`}>{roleBadge.label}</span>
            {isOwner && (
              <button type="button" className="btn btn-xs bg-red-500 text-white border-none hover:bg-red-600" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {group.members.length === 0 && (
            <li className="text-sm text-colortext-2">
              No members yet{isOwner ? " — invite someone by email below." : "."}
            </li>
          )}
          {group.members.map((member) => {
            const inviteToken = readInviteToken(member);
            return (
              <li key={member.email} className="flex flex-col gap-1 rounded-lg bg-main-3 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-black">{member.email}</span>
                  <span className={`badge badge-sm ${member.status === "joined" ? "badge-success" : "badge-warning"}`}>
                    {member.status}
                  </span>
                </div>
                {member.status === "invited" && inviteToken && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-colortext-2">
                    <span>Invite token (single use):</span>
                    <code className="rounded bg-main-1 px-1 py-0.5">{inviteToken}</code>
                    <CopyButton value={inviteToken} label="Copy token" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-colortext-3">
          Invited members normally receive the token by email; it is shown here so the join flow
          works without a mail server.
        </p>

        {isOwner && (
          <form className="flex flex-wrap items-center gap-2" onSubmit={handleInvite}>
            <input
              type="email"
              required
              placeholder="peer@example.com"
              className="input input-bordered input-sm w-64 bg-main-1 text-black"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={inviting}>
              {inviting ? <span className="loading loading-spinner loading-xs"></span> : "Invite"}
            </button>
          </form>
        )}

        {error && (
          <div role="alert" className="alert alert-error py-2 text-sm">
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
