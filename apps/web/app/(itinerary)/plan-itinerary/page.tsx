"use client";

/**
 * Plan-itinerary page (diagram: "Clients — Web" → API Gateway → Gemini
 * Service). Loads the two reference datasets the form needs — countries
 * (with hub airport codes) and travel types — from gemini-service through
 * the typed api-client (`GET /api/gemini/reference/*`).
 *
 * This used to be a server component querying Supabase via the monolith's
 * fetch-strategy classes. It is a client component now because the reference
 * endpoints sit behind the gateway's JWT check: the session cookie lives in
 * the browser, so the fetch has to happen there (mock mode swaps the same
 * client for the canned in-memory one, so this page still renders offline).
 */

import { useEffect, useState } from "react";
import { Country } from "@/types/Country";
import { TravelType } from "@/types/TravelType";
import { getApiClient } from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiErrors";
import dynamic from "next/dynamic";

const ItineraryForm = dynamic(() =>
  import("@/app/(itinerary)/plan-itinerary/ItineraryForm").then(
    (mod) => mod.default
  ),
);

export default function PlanItinerary() {
  const [countryData, setCountryData] = useState<Country[]>([]);
  const [travelData, setTravelData] = useState<TravelType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const client = getApiClient();
        // Both lists come from gemini-db (seeded reference tables); zod has
        // already validated the envelope, the item shape is the shared
        // Country/TravelType contract the form has always used.
        const [countries, travelTypes] = await Promise.all([
          client.gemini.listCountries(),
          client.gemini.listTravelTypes(),
        ]);
        setCountryData(countries.items as Country[]);
        setTravelData(travelTypes.items as TravelType[]);
      } catch (error) {
        console.error("Error loading plan-form reference data:", error);
        setLoadError(apiErrorMessage(error, "Could not load the planning form data."));
      }
    };
    loadReferenceData();
  }, []);

  if (loadError) {
    return (
      <div className="flex flex-col items-center p-8">
        <h1 className="text-3xl font-bold text-black">Generate Your Itinerary</h1>
        <p className="mt-4 text-lg text-black">{loadError}</p>
      </div>
    );
  }

  if (countryData.length === 0 || travelData.length === 0) {
    return (
      <div className="absolute inset-0 w-full h-full bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
        <span className="loading loading-spinner text-white text-2xl"></span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-8">
      <div className="flex items-center gap-4 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="size-10">
          <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
          <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
        </svg>
        <h1 className="text-6xl font-bold text-black">Generate Your Itinerary</h1>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="size-10">
          <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
          <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
        </svg>
      </div>
      <p className="text-xl text-black">
        Embark on your dream adventure with just a few simple details. Smart
        Voyage will curate a personalized itinerary, crafted to match your
        unique preferences!
      </p>
      <ItineraryForm
        countries={countryData}
        travelType={travelData}
      ></ItineraryForm>
    </div>
  );
}
