import { GeminiConfig, PlanForm } from "@smart/shared";
import { GeminiConfigBuilder } from "./GeminiConfigBuilder";
import { HotelSchema } from "./HotelSchema";
import { ItinerarySchema } from "./ItinerarySchema";

/** Everything one Gemini call needs — what the prompts.ts builders return. */
export interface GeminiGeneration {
  prompt: string;
  generationConfig: GeminiConfig;
}

/**
 * Prompt + generation-config pairs for the two AI generations of the plan
 * flow (moved from the monolith's
 * apps/web/app/(itinerary)/itinerary/GenerateItineraryConfig.ts and
 * GenerateWeatherConfig.ts).
 *
 * Both take the plan-itinerary form as typed by the shared PlanFormSchema —
 * the same fields the web form collects. Each returns everything
 * GeminiService.generateContent needs, so a route handler reads as:
 *   const { prompt, generationConfig } = buildItineraryGeneration(form);
 */

/**
 * Day-by-day trip itinerary. Temperature 1 (creative), JSON-only output,
 * constrained by ItinerarySchema so the response can be rendered and saved
 * without remapping.
 */
export function buildItineraryGeneration(form: PlanForm): GeminiGeneration {
  const prompt = ` I am planning a trip from country ${form.source} to ${form.destination} between dates ${form.startDate} to ${form.endDate} with a budget between ${form.minBudget} and ${form.maxBudget}.
                  The purpose of my trip is ${form.preferences}, and I will be traveling with ${form.travelGroup} and number of people is ${form.numberPeople}.
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

/**
 * Per-day weather forecast for the destination. Temperature 0.5 (more
 * factual), JSON-only output but NO schema — the model describes conditions
 * in free-form JSON, which the timeline renders as-is.
 */
export function buildWeatherGeneration(form: PlanForm): GeminiGeneration {
  const prompt = `  Generate a weather forecast for ${form.destination} from ${form.startDate} to ${form.endDate}.
                    The forecast should include the temperature, and a description of the weather condition for each day. The weather conditions should include one of the following descriptions: clear sky, few clouds, scattered clouds, broken clouds, shower rain, rain, thunderstorm, snow, or mist.
                    Ensure the forecast is based on typical weather patterns for this time of year in the specified location.
                    Ensure that the forecast has only one forecast for each day.
                    The forecast should be in JSON format.
                  `;

  const generationConfig = new GeminiConfigBuilder()
    .withTemperature(0.5)
    .withTopP(0.95)
    .withTopK(30)
    .withMaxOutputTokens(4096)
    .withResponseMimeType("application/json")
    .build();

  return { prompt, generationConfig };
}

/**
 * Hotel suggestions for a free-text search query (the monolith's
 * hooks/useHotels.ts prompt). Constrained by HotelSchema so the response is
 * directly a `Hotel[]`.
 */
export function buildHotelSearchGeneration(query: string): GeminiGeneration {
  const prompt =
    "I am creating a search bar for hotels, and I would like you to suggest hotels based on my search query. " +
    "Can you include hotel details suchs as ratings, price, description, image address of any image you can " +
    "get on the website itself. Please return an empty json array if there are no hotel suggestions. " +
    `The query is "${query}"`;

  const generationConfig = new GeminiConfigBuilder()
    .withTemperature(1)
    .withTopP(0.95)
    .withTopK(40)
    .withMaxOutputTokens(8192)
    .withResponseMimeType("application/json")
    .withResponseSchema(HotelSchema)
    .build();

  return { prompt, generationConfig };
}
