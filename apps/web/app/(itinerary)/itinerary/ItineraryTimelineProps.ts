import { Itinerary } from "@/types/Itinerary";
import { FlightDisplayDetails } from "@/types/FlightDisplayDetails";

export interface ItineraryTimelineProps {
  itinerary: Itinerary;
  /** Verbatim weather payload — canonical day rows from /gemini/plan, or any
   *  historical stored shape; normalized for rendering inside the timeline. */
  weatherForecast: unknown;
  userId: string;
  itineraryId: string;
  flightDisplayDetails: FlightDisplayDetails[];
  isGeneratedItinerary: boolean;
}
