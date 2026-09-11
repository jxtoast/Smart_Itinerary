"use client";
/**
 * Groups page (T2.5 tools UI) — the management surface for the diagram's
 * "Tools Service — Sharing" box, mounted at /groups inside the (tools) route
 * group (URL style matches the other flat routes: /hotel, /itinerary, …).
 *
 * Everything here goes through the typed api-client (`@smart/api-client`
 * via getSessionApiClient): create a group, invite peers by email (their
 * single-use invite tokens are shown on each group card), join a group with
 * such a token, and share one of your saved itineraries to a group or by
 * direct email. All failures — 401 session expired, 403 non-owner, 409
 * duplicate invite, offline — render as inline error panels, never a crash.
 *
 * The page needs a session (the gateway 401s anonymous traffic), so
 * unauthenticated visitors are redirected to the sign-in page like on the
 * other protected pages.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroupDto } from "@smart/shared/src/dto/tools";
import type { ListItinerariesResponse } from "@smart/shared/src/dto/itineraries";
import { useAuth } from "@/context/AuthContext";
import AuthForm from "@/components/forms/AuthForm";
import { getSessionApiClient } from "@/lib/apiClientSession";
import { describeApiClientError } from "@/lib/apiError";
import GroupCard from "./GroupCard";
import ShareItineraryPanel from "./ShareItineraryPanel";

type SavedItinerarySummary = ListItinerariesResponse["itineraries"][number];

export default function GroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // `null` means "still loading" — distinct from the empty-list case.
  const [groups, setGroups] = useState<GroupDto[] | null>(null);
  const [itineraries, setItineraries] = useState<SavedItinerarySummary[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Create-group form state.
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join-by-token form state.
  const [inviteToken, setInviteToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedGroupName, setJoinedGroupName] = useState<string | null>(null);

  // Anonymous visitors go to the sign-in page (same as other protected pages).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [authLoading, user, router]);

  const refreshGroups = useCallback(async () => {
    try {
      setGroups(await getSessionApiClient().tools.listGroups());
    } catch (caught) {
      setPageError(describeApiClientError(caught));
    }
  }, []);

  // Load the caller's groups + saved itineraries once the session is known.
  useEffect(() => {
    if (!user) {
      return;
    }
    refreshGroups();
    getSessionApiClient()
      .itineraries.listForUser(String(user.id))
      .then((response) => setItineraries(response.itineraries))
      .catch((caught) => setPageError(describeApiClientError(caught)));
  }, [user, refreshGroups]);

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name || creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const group = await getSessionApiClient().tools.createGroup({ name });
      setGroups((current) => [group, ...(current ?? [])]);
      setNewGroupName("");
    } catch (caught) {
      setCreateError(describeApiClientError(caught));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    const token = inviteToken.trim();
    if (!token || joining) {
      return;
    }
    setJoining(true);
    setJoinError(null);
    setJoinedGroupName(null);
    try {
      const group = await getSessionApiClient().tools.joinGroup({ inviteToken: token });
      setJoinedGroupName(group.name);
      setInviteToken("");
      await refreshGroups();
    } catch (caught) {
      setJoinError(describeApiClientError(caught));
    } finally {
      setJoining(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <span className="loading loading-spinner text-2xl"></span>
      </div>
    );
  }

  if (!user) {
    // Briefly visible while redirecting to /auth — also a fallback if the
    // redirect cannot complete.
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold text-black">Please sign in</h1>
        <p className="text-colortext-2">Groups and sharing need a signed-in session.</p>
        <AuthForm />
      </div>
    );
  }

  const currentUserId = String(user.id);
  const currentUserEmail = String(user.email ?? "");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-black">Travel Groups</h1>
        <p className="mt-1 text-colortext-2">
          Plan together: create a group, invite your travel companions, and share saved
          itineraries with them.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card bg-main-2 shadow-md">
          <div className="card-body p-5 gap-3">
            <h2 className="card-title text-lg text-black">Create a group</h2>
            <form className="flex flex-col items-start gap-2" onSubmit={handleCreateGroup}>
              <input
                type="text"
                required
                placeholder="e.g. Tokyo Trip Crew"
                className="input input-bordered input-sm w-full bg-main-1 text-black"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-xs"></span>
                    Creating…
                  </span>
                ) : (
                  "Create group"
                )}
              </button>
            </form>
            {createError && (
              <div role="alert" className="alert alert-error py-2 text-sm">
                <span>{createError}</span>
              </div>
            )}
          </div>
        </div>

        <div className="card bg-main-2 shadow-md">
          <div className="card-body p-5 gap-3">
            <h2 className="card-title text-lg text-black">Join with an invite token</h2>
            <p className="text-sm text-colortext-2">
              Paste the single-use token a group owner shared with you.
            </p>
            <form className="flex flex-col items-start gap-2" onSubmit={handleJoin}>
              <input
                type="text"
                required
                placeholder="invite token"
                className="input input-bordered input-sm w-full bg-main-1 text-black"
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={joining}>
                {joining ? (
                  <span className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-xs"></span>
                    Joining…
                  </span>
                ) : (
                  "Join group"
                )}
              </button>
            </form>
            {joinedGroupName && (
              <div role="status" className="alert alert-success py-2 text-sm">
                <span>You joined “{joinedGroupName}”.</span>
              </div>
            )}
            {joinError && (
              <div role="alert" className="alert alert-error py-2 text-sm">
                <span>{joinError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {itineraries !== null && <ShareItineraryPanel groups={groups ?? []} itineraries={itineraries} />}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-black">Your groups</h2>
        {groups === null && (
          <div className="flex justify-center p-4">
            <span className="loading loading-spinner"></span>
          </div>
        )}
        {groups !== null && groups.length === 0 && (
          <p className="text-colortext-2">
            No groups yet — create one above, or join one with an invite token.
          </p>
        )}
        {groups?.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            onGroupChanged={(updated) =>
              setGroups((current) =>
                current?.map((candidate) => (candidate.id === updated.id ? updated : candidate)) ?? current
              )
            }
            onGroupDeleted={(groupId) =>
              setGroups((current) => current?.filter((candidate) => candidate.id !== groupId) ?? current)
            }
          />
        ))}
      </section>

      {pageError && (
        <div role="alert" className="alert alert-error">
          <span>{pageError}</span>
        </div>
      )}
    </div>
  );
}
