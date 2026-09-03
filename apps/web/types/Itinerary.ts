import { ItineraryDay } from "./ItineraryDay";
import { ItineraryDemographics } from "./ItineraryDemographics";
import { ItineraryAccommodation } from "./ItineraryAccommodation";

export interface Itinerary {
  id?: string | null;
  userId?: string | null;
  startDate: string;
  endDate: string;
  sourceCountry: string;
  destination: string;
  demographics: ItineraryDemographics;
  accommodation: ItineraryAccommodation[];
  itineraryDays: ItineraryDay[];
  estimatedTotalCost: number;
  importantNotes: string[];
  travelerType?: string;
}
