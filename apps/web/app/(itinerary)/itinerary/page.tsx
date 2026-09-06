"use client";
import { useState, useEffect, useRef } from "react";
import { use } from 'react'
import ItineraryTimeline from "./ItineraryTimeline";
import { Itinerary } from '@/types/Itinerary';
import { ItineraryDemographics } from '@/types/ItineraryDemographics';
import { FlightDisplayDetails } from '@/types/FlightDisplayDetails'
import { WeatherForecast } from '@/types/WeatherForecast'
import { getApiClient } from "@/lib/api";
import { ApiClientError } from "@smart/api-client";
import { FlightSearchCriteriaBuilder } from "@/lib/FlightSearchCriteriaBuilder";

export default function ItineraryPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string }>
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [flightDetails, setFlightDetails] = useState<FlightDisplayDetails[] | []>([]);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[] | null>(null);
  const [isGeneratedItinerary, setIsGeneratedItinerary] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /**
   * Single-flight guard: one page mount may start at most ONE plan request.
   * In dev, React StrictMode deliberately invokes every effect twice on
   * mount — the `itinerary` state check below cannot catch that (state has
   * not updated yet when the second invocation runs), so without this ref a
   * single Generate click fires /gemini/plan twice, doubling the free-tier
   * Gemini quota burn and racing two 25s requests through the dev proxy.
   */
  const generationStartedRef = useRef(false);

  const { data } = use(searchParams)

  useEffect(() => {
    if (!data || itinerary || generationStartedRef.current) {
      return;
    }
    generationStartedRef.current = true;
    const fetchItinerary = async () => {
      setLoading(true);
      try {
        if (data) {
          setIsGeneratedItinerary(true);
          const parsedData = JSON.parse(decodeURIComponent(data));
          if (parsedData) {
            const searchCriteriaNew = new FlightSearchCriteriaBuilder()
            .withOriginCountry(parsedData.sourceAirportCode || '')
            .withDestinationCountry(parsedData.destinationAirportCode || '')
            .withDepartureDate(parsedData.startDate || '')
            .withReturnDate(parsedData.endDate || '')
            .withPax(parseInt(parsedData.numberPeople) || 1)
            .withNumberOfResults(8)
            .build();

            // The plan facade (itinerary + weather + flights in one call) runs
            // server-side in gemini-service now — the browser holds no Gemini
            // or Amadeus key anymore. Individual artifacts degrade honestly:
            // flightDetails/weatherData come back null when Amadeus is
            // unconfigured or a generation failed, so only the failing part
            // of the page is empty.
            const results = await getApiClient().gemini.plan({
              form: parsedData,
              flightSearchCriteria: searchCriteriaNew,
            });

            if (results.itineraryData) {
              const generated = results.itineraryData as Itinerary;
              // A degraded generation can omit sections the save schema
              // expects (ItineraryPayloadSchema requires demographics; the
              // wire schema defaults its inner fields itself). Fill the
              // no-data equivalents so "Save Itinerary" still round-trips.
              setItinerary({
                ...generated,
                demographics: generated.demographics ?? {
                  purpose: "",
                  currency: "",
                  travelerType: "",
                },
                accommodation: generated.accommodation ?? [],
              });
            }
            if (results.weatherData) {
              const weather = results.weatherData as WeatherForecast | WeatherForecast[];
              setWeatherForecast(Array.isArray(weather) ? weather : [weather]);
            }

            if (results.flightDetails) {
              setFlightDetails(results.flightDetails as FlightDisplayDetails[]);
            }
          }
        }
      } catch (error) {
        console.error("Error generating itinerary:", error);
        // The page keeps its generic error box; the answers worth spelling
        // out to the reader: 503 (AI keys not configured server-side), 504
        // (real generation exceeded the gateway's ceiling — a retry usually
        // succeeds), and an interrupted hop between the browser and the
        // gateway (network failure, or a 500 with no JSON error body — the
        // dev server's proxy answering for a dropped connection, since the
        // gateway/services always send a JSON `{ error }` body on 500s).
        if (error instanceof ApiClientError && error.status === 503) {
          setErrorMessage("AI generation is not configured on the server yet.");
        } else if (error instanceof ApiClientError && error.status === 504) {
          setErrorMessage("The AI took too long to generate this trip. Please try again.");
        } else if (
          error instanceof ApiClientError &&
          (error.isNetworkFailure || (error.status === 500 && error.body === undefined))
        ) {
          setErrorMessage("The connection dropped while generating. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchItinerary();
  }, []);

  if (loading) {
    return (
      <div className="absolute inset-0 w-full h-full bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
        <span className="loading loading-spinner text-white text-2xl"></span>
      </div>
    );
  }

  return (
    <>
      <div>
        {itinerary ? (
          <div>
            <ItineraryTimeline isGeneratedItinerary={isGeneratedItinerary} itinerary={itinerary} weatherForecast={weatherForecast} userId="null" itineraryId="null" flightDisplayDetails={flightDetails} />
          </div>
        ) : (
          <div>
            Error generating itinerary. Please try again later.
            {errorMessage && (
              <div className="mt-2 text-sm text-gray-600">{errorMessage}</div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
