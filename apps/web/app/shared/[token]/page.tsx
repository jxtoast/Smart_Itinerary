"use client";
/**
 * Shared itinerary view (T2.5 tools UI) — /shared/<token>, the page a share
 * link opens (tools-service builds links as ${WEB_PUBLIC_URL}/shared/<token>).
 *
 * Data path: GET /api/tools/shares/:token (typed api-client) → the gateway
 * 401s anonymous traffic, so this page requires a session and redirects
 * unauthenticated visitors to the sign-in page like the other protected
 * pages. A 404 at VIEW time is the existence check — creating a share never
 * verified the itinerary — so an unknown, revoked, or deleted-itinerary
 * token renders a clear "not available" panel instead of an error crash.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { SharedItineraryResponse } from "@smart/shared/src/dto/tools";
import { ApiClientError } from "@smart/api-client";
import { useAuth } from "@/context/AuthContext";
import AuthForm from "@/components/forms/AuthForm";
import { getSessionApiClient } from "@/lib/apiClientSession";
import { describeApiClientError } from "@/lib/apiError";
import SharedItineraryView from "@/components/tools/SharedItineraryView";

export default function SharedItineraryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // useParams types can be string | string[]; share tokens are one segment.
  const shareToken = Array.isArray(params.token) ? params.token[0] : params.token;

  const [shared, setShared] = useState<SharedItineraryResponse | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSharedItinerary = useCallback(async () => {
    if (!user || !shareToken) {
      return;
    }
    setLoading(true);
    setNotAvailable(false);
    setError(null);
    try {
      setShared(await getSessionApiClient().tools.getSharedItinerary(shareToken));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        // Unknown token, revoked link, or the itinerary behind it was deleted.
        setNotAvailable(true);
      } else {
        setError(describeApiClientError(caught));
      }
    } finally {
      setLoading(false);
    }
  }, [user, shareToken]);

  useEffect(() => {
    loadSharedItinerary();
  }, [loadSharedItinerary]);

  // Anonymous viewers go to the sign-in page (the gateway would 401 them anyway).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [authLoading, user, router]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <span className="loading loading-spinner text-2xl"></span>
      </div>
    );
  }

  if (!user) {
    // Briefly visible while redirecting to /auth — also a fallback.
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold text-black">Please sign in</h1>
        <p className="text-colortext-2">Shared itineraries can only be viewed signed in.</p>
        <AuthForm />
      </div>
    );
  }

  if (notAvailable) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="card bg-main-2 shadow-md">
          <div className="card-body p-8 text-center">
            <h1 className="card-title justify-center text-2xl text-black">
              This share link isn&apos;t available
            </h1>
            <p className="text-colortext-2">
              The link may be wrong, revoked, or the itinerary behind it was deleted. Ask the
              person who shared it to send a fresh link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div role="alert" className="alert alert-error max-w-md">
          <span>{error}</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={loadSharedItinerary}>
          Try again
        </button>
      </div>
    );
  }

  return shared ? <SharedItineraryView shared={shared} /> : null;
}
