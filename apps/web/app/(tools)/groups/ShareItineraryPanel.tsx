"use client";
/**
 * ShareItineraryPanel (T2.5 tools UI) — the share-to-group action.
 *
 * Picks one of the caller's saved itineraries and shares it with a group,
 * with extra direct email recipients, or both — then hands back the share
 * link (POST /api/tools/shares → { shareToken, shareUrl }). Note the tools
 * service deliberately does NOT check that the itinerary id exists at share
 * time (sharing must not depend on itinerary-service being up); a mistyped
 * id only surfaces when someone opens the link, which is why this panel only
 * offers itineraries from the caller's own saved list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
// Subpath contract imports, not the @smart/shared barrel (browser safety —
// see packages/api-client/src/client.ts).
import { MemberInviteSchema } from "@smart/shared/src/dto/tools";
import type { GroupDto, ShareResponse } from "@smart/shared/src/dto/tools";
import type { ListItinerariesResponse } from "@smart/shared/src/dto/itineraries";
import { getSessionApiClient } from "@/lib/apiClientSession";
import { describeApiClientError } from "@/lib/apiError";
import CopyButton from "@/components/tools/CopyButton";

type SavedItinerarySummary = ListItinerariesResponse["itineraries"][number];

interface ShareItineraryPanelProps {
  groups: GroupDto[];
  itineraries: SavedItinerarySummary[];
}

/**
 * Split a free-text "a@x.com, b@y.com" field into validated addresses.
 * Each address is checked with the shared invite schema — reusing the
 * contract instead of hand-rolling a regex, without importing zod here.
 */
function parseRecipientEmails(raw: string): { emails: string[]; invalid: string[] } {
  const candidates = raw
    .split(/[,;\s]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const candidate of candidates) {
    if (MemberInviteSchema.safeParse({ email: candidate }).success) {
      emails.push(candidate);
    } else {
      invalid.push(candidate);
    }
  }
  return { emails, invalid };
}

export default function ShareItineraryPanel({ groups, itineraries }: ShareItineraryPanelProps) {
  const [itineraryId, setItineraryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [recipientEmails, setRecipientEmails] = useState("");
  const [sharing, setSharing] = useState(false);
  const [result, setResult] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default the selects to the first saved itinerary / first group.
  useEffect(() => {
    setItineraryId((current) => current || itineraries[0]?.id || "");
  }, [itineraries]);
  useEffect(() => {
    setGroupId((current) => current || groups[0]?.id || "");
  }, [groups]);

  async function handleShare(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    setError(null);

    const { emails, invalid } = parseRecipientEmails(recipientEmails);
    if (invalid.length > 0) {
      setError(`These email addresses look wrong: ${invalid.join(", ")}`);
      return;
    }
    if (!groupId && emails.length === 0) {
      setError("Pick a group or enter at least one recipient email.");
      return;
    }

    setSharing(true);
    try {
      const share = await getSessionApiClient().tools.createShare({
        itineraryId,
        ...(groupId ? { groupId } : {}),
        ...(emails.length > 0 ? { recipientEmails: emails } : {}),
      });
      setResult(share);
    } catch (caught) {
      setError(describeApiClientError(caught));
    } finally {
      setSharing(false);
    }
  }

  if (itineraries.length === 0) {
    return (
      <div className="card bg-main-2 shadow-md">
        <div className="card-body p-5">
          <h3 className="card-title text-lg text-black">Share an itinerary</h3>
          <p className="text-sm text-colortext-2">
            You have no saved itineraries yet — save one from the planner first, then share it
            here with a group or by email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-main-2 shadow-md">
      <div className="card-body p-5 gap-3">
        <h3 className="card-title text-lg text-black">Share an itinerary</h3>
        <p className="text-sm text-colortext-2">
          Creates a read-only share link and emails the audience (when the mail service is
          running). The link itself works for anyone you give it to.
        </p>

        <form className="flex flex-col gap-3" onSubmit={handleShare}>
          <label className="flex flex-col gap-1 text-sm text-black">
            Itinerary
            <select
              className="select select-bordered select-sm bg-main-1 text-black"
              value={itineraryId}
              onChange={(event) => setItineraryId(event.target.value)}
            >
              {itineraries.map((itinerary) => (
                <option key={itinerary.id} value={itinerary.id}>
                  {itinerary.destination} ({itinerary.start_date} → {itinerary.end_date})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-black">
            Group
            <select
              className="select select-bordered select-sm bg-main-1 text-black"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">No group — direct emails only</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-black">
            Extra recipients (optional, comma-separated)
            <input
              type="text"
              placeholder="peer@example.com, other@example.com"
              className="input input-bordered input-sm bg-main-1 text-black"
              value={recipientEmails}
              onChange={(event) => setRecipientEmails(event.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary btn-sm w-fit" disabled={sharing}>
            {sharing ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-xs"></span>
                Sharing…
              </span>
            ) : (
              "Create share link"
            )}
          </button>
        </form>

        {result && (
          <div className="flex flex-col gap-1 rounded-lg bg-main-3 px-3 py-2 text-sm text-black">
            <span>
              Share link ready —{" "}
              <Link href={`/shared/${result.shareToken}`} className="link link-primary">
                open the shared view
              </Link>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-main-1 px-1 py-0.5 text-xs">{result.shareUrl}</code>
              <CopyButton value={result.shareUrl} label="Copy link" />
            </div>
          </div>
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
