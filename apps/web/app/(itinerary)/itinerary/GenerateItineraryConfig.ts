import { ItineraryProps } from "./ItineraryProps";
import { ItinerarySchema } from "@/data/ItinerarySchema";
import { GeminiConfigBuilder } from "@/services/GeminiConfigBuilder";

function GenerateItineraryConfig(itinerary: ItineraryProps) {

  const prompt = ` I am planning a trip from country ${itinerary.source} to ${itinerary.destination} between dates ${itinerary.startDate} to ${itinerary.endDate} with a budget between ${itinerary.minBudget} and ${itinerary.maxBudget}. 
                  The purpose of my trip is ${itinerary.preferences}, and I will be traveling with ${itinerary.travelGroup} and number of people is ${itinerary.numberPeople}.
                  Based on these details, suggest an itinerary with recommended places to visit, activities to do with upload.wikimedia.org public images urls, location, "timings": "9:00 AM - 6:00 PM" and estimated costs within my budget.
                  `;

  const generationConfig = new GeminiConfigBuilder()
    .withTemperature(1)
    .withTopP(0.95)
    .withTopK(40)
    .withMaxOutputTokens(8192)
    .withResponseMimeType("application/json")
    .withResponseSchema(ItinerarySchema)
    .build();

  return { prompt, generationConfig };
}

export default GenerateItineraryConfig;
