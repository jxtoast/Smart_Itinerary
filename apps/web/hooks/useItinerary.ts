"use client";

/**
 * Itinerary list hook (diagram: "Clients — Web" → API Gateway → Itinerary
 * Service). Loads a user's saved itineraries through the typed api-client
 * (GET /api/itineraries/user/:userId) instead of a browser-side Supabase
 * query; errors surface to the caller as ApiClientError.
 */
import { useState } from "react";
import { getApiClient } from "@/lib/api";
import type { ListItinerariesResponse } from "@smart/shared";

export const useItinerary = () => {
  const [itineraries, setItineraries] = useState<ListItinerariesResponse["itineraries"]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const listItineraries = async (userId: string): Promise<void> => {
    setIsLoading(true);
    try {
      const { itineraries: savedItineraries } = await getApiClient().itineraries.listForUser(userId);
      setItineraries(savedItineraries);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    itineraries,
    isLoading,
    listItineraries,
  };
};
