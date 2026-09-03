import { Itinerary } from "@/types/Itinerary";
import { FlightDisplayDetails } from "@/types/FlightDisplayDetails";

export interface ItineraryTimelineProps {
  itinerary: Itinerary;
  weatherForecast: any;
  userId: string;
  itineraryId: string;
  flightDisplayDetails: FlightDisplayDetails[];
  isGeneratedItinerary: boolean;
}
