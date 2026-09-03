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

export const PlanResponseSchema = z.object({
  itineraryData: z.unknown().nullable(),
  weatherData: z.unknown().nullable(),
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
