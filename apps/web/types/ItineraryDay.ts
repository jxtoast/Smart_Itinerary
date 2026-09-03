import { ItineraryActivity } from "./ItineraryActivity";

export interface ItineraryDay {
  id: string;
  date: string;
  location: string;
  description: string;
  activities: ItineraryActivity[];
}
