import { z } from "zod";

/**
 * Itinerary Service request/response contracts.
 *
 * Zod validates the fields the service actually persists (see
 * db/init/itinerary-service.sql); `.passthrough()` keeps the richer
 * `@smart/shared/src/types/Itinerary` shape intact end-to-end.
 */

const numericId = z.union([z.string(), z.number()]).nullable().optional();

export const ActivityPayloadSchema = z
  .object({
    id: numericId,
    name: z.string(),
    details: z.string().optional().default(""),
    estimatedCost: z.number().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    timing: z.string().optional().default(""),
  })
  .passthrough();

export const DayPayloadSchema = z
  .object({
    id: numericId,
    date: z.string(),
    location: z.string(),
    description: z.string().optional().default(""),
    activities: z.array(ActivityPayloadSchema).default([]),
  })
  .passthrough();

export const AccommodationPayloadSchema = z
  .object({
    id: numericId,
    name: z.string(),
    estimatedCost: z.number().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    hotelDescription: z.string().nullable().optional(),
  })
  .passthrough();

export const ItineraryDemographicsPayloadSchema = z
  .object({
    currency: z.string().optional().default(""),
    budgetMin: z.number().nullable().optional(),
    budgetMax: z.number().nullable().optional(),
    travelerType: z.string().optional().default(""),
    purpose: z.string().optional().default(""),
  })
  .passthrough();

export const ItineraryPayloadSchema = z
  .object({
    id: numericId,
    sourceCountry: z.string(),
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    estimatedTotalCost: z.number(),
    importantNotes: z.array(z.string()).default([]),
    demographics: ItineraryDemographicsPayloadSchema,
    accommodation: z.array(AccommodationPayloadSchema).default([]),
    itineraryDays: z.array(DayPayloadSchema).default([]),
  })
  .passthrough();

export const CreateItineraryRequestSchema = z.object({
  userId: z.string().uuid(),
  itinerary: ItineraryPayloadSchema,
  /** Weather forecast is stored verbatim as JSONB. */
  weatherForecast: z.unknown(),
});
export type CreateItineraryRequest = z.infer<typeof CreateItineraryRequestSchema>;

export const CreateItineraryResponseSchema = z.object({
  itineraryId: z.string().nullable(),
});
export type CreateItineraryResponse = z.infer<typeof CreateItineraryResponseSchema>;

export const UpdateItineraryRequestSchema = CreateItineraryRequestSchema;
export type UpdateItineraryRequest = CreateItineraryRequest;

/** Full itinerary aggregate; nested shape mirrors the shared Itinerary type. */
export const GetItineraryResponseSchema = z
  .object({ id: z.string() })
  .passthrough();
export type GetItineraryResponse = z.infer<typeof GetItineraryResponseSchema>;

export const ListItinerariesResponseSchema = z.object({
  itineraries: z
    .array(
      z
        .object({
          id: z.string(),
          destination: z.string(),
          start_date: z.string(),
          end_date: z.string(),
        })
        .passthrough()
    )
    .default([]),
});
export type ListItinerariesResponse = z.infer<typeof ListItinerariesResponseSchema>;
