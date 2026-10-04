import { z } from "zod";

/** Gemini (Hotel) Service contracts: AI generation, hotels, flights, reference data. */

/** Mirrors ItineraryProps from the plan-itinerary form. */
export const PlanFormSchema = z
  .object({
    source: z.string(),
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    minBudget: z.number(),
    maxBudget: z.number(),
    preferences: z.array(z.string()).default([]),
    travelGroup: z.string(),
    numberPeople: z.union([z.string(), z.number()]),
  })
  .passthrough();
export type PlanForm = z.infer<typeof PlanFormSchema>;

/** Mirrors FlightSearchCriteria from @smart/shared/src/types/Flight. */
export const FlightSearchCriteriaSchema = z
  .object({
    origin_country: z.string().optional(),
    destination_country: z.string().optional(),
    departure_date: z.string().optional(),
    return_date: z.string().optional(),
    pax: z.number().optional(),
    number_of_results: z.number().optional(),
  })
  .passthrough();
export type FlightSearchCriteriaDto = z.infer<typeof FlightSearchCriteriaSchema>;

export const PlanRequestSchema = z.object({
  form: PlanFormSchema,
  flightSearchCriteria: FlightSearchCriteriaSchema.optional(),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

// --- Weather ------------------------------------------------------------------
// The weather generation deliberately leaves the model in free-form JSON (see
// services/gemini-service/src/gemini/prompts.ts — no response schema), so the
// emitted shape has drifted: the monolith era produced a flat per-day array
// ({date, location, temperature_celsius, condition}), while the current model
// wraps the days in [{forecast: [...], location}] and splits the temperature
// into {max_celsius, min_celsius}. WeatherDay is the canonical render shape,
// and normalizeWeatherForecast() tolerates every shape observed so far —
// including legacy rows already stored verbatim in itinerary-db's JSONB.

export const WeatherDaySchema = z.object({
  date: z.string(),
  condition: z.string(),
  /** Day high when the source gives a range; the single temperature otherwise. */
  temperatureCelsius: z.number().optional(),
  temperatureMinCelsius: z.number().optional(),
});
export type WeatherDay = z.infer<typeof WeatherDaySchema>;

function isWeatherRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pull the temperature out of a day in any of the observed encodings. */
function weatherTemperatures(day: Record<string, unknown>): {
  temperatureCelsius?: number;
  temperatureMinCelsius?: number;
} {
  const scalar = day.temperature_celsius ?? day.temperatureCelsius;
  if (typeof scalar === "number") return { temperatureCelsius: scalar };
  const range = day.temperature;
  if (!isWeatherRecord(range)) return {};
  const max = range.max_celsius ?? range.max;
  const min = range.min_celsius ?? range.min;
  return {
    temperatureCelsius: typeof max === "number" ? max : undefined,
    temperatureMinCelsius: typeof min === "number" ? min : undefined,
  };
}

/**
 * Narrow any weather payload into canonical day rows, or null when nothing
 * renderable survives. Accepts the three observed container shapes — a bare
 * day array, the `{forecast: [...]}` wrapper, and an array of such wrappers —
 * and skips (never rejects on) individual malformed days.
 */
export function normalizeWeatherForecast(raw: unknown): WeatherDay[] | null {
  const days = Array.isArray(raw)
    ? raw.flatMap((entry) =>
        isWeatherRecord(entry) && Array.isArray(entry.forecast) ? entry.forecast : [entry],
      )
    : isWeatherRecord(raw) && Array.isArray(raw.forecast)
      ? raw.forecast
      : null;
  if (!days) return null;

  const out: WeatherDay[] = [];
  for (const day of days) {
    if (!isWeatherRecord(day) || typeof day.date !== "string" || typeof day.condition !== "string") {
      continue;
    }
    out.push(
      WeatherDaySchema.parse({ date: day.date, condition: day.condition, ...weatherTemperatures(day) }),
    );
  }
  return out.length > 0 ? out : null;
}

export const PlanResponseSchema = z.object({
  itineraryData: z.unknown().nullable(),
  weatherData: z.array(WeatherDaySchema).nullable(),
  flightDetails: z.unknown().nullable(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const GenerateItineraryRequestSchema = z.object({ form: PlanFormSchema });
export const GenerateTextResponseSchema = z.object({ text: z.string().nullable() });

export const HotelsSearchRequestSchema = z.object({ query: z.string().min(1) });
export type HotelsSearchRequest = z.infer<typeof HotelsSearchRequestSchema>;

export const HotelDtoSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    description: z.string(),
    image_url: z.string(),
    price: z.string(),
    rating: z.number(),
  })
  .passthrough();
export type HotelDto = z.infer<typeof HotelDtoSchema>;

export const HotelsSearchResponseSchema = z.object({ hotels: z.array(HotelDtoSchema) });
export type HotelsSearchResponse = z.infer<typeof HotelsSearchResponseSchema>;

export const FlightsSearchRequestSchema = z.object({
  criteria: FlightSearchCriteriaSchema,
});
export type FlightsSearchRequest = z.infer<typeof FlightsSearchRequestSchema>;

export const FlightsSearchResponseSchema = z.object({
  flights: z.array(z.unknown()),
});
export type FlightsSearchResponse = z.infer<typeof FlightsSearchResponseSchema>;

export const ReferenceTypeSchema = z.enum(["countries", "travel-types"]);
export type ReferenceType = z.infer<typeof ReferenceTypeSchema>;

export const ReferenceResponseSchema = z.object({ items: z.array(z.unknown()) });
export type ReferenceResponse = z.infer<typeof ReferenceResponseSchema>;
