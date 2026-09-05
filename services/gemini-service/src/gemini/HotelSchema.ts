import { SchemaType } from "@google/generative-ai";

/**
 * Gemini response schema for hotel suggestions (moved from the monolith's
 * apps/web/data/HotelSchema.ts as planned in T0.3 — it stays out of
 * @smart/shared on purpose because SchemaType is a vendor-specific type).
 *
 * Unlike ItinerarySchema this one uses the SDK's SchemaType enum; both styles
 * reach the API as the same JSON. The shape mirrors the shared `Hotel` type
 * that the hotel search UI consumes.
 */
export const HotelSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      address: {
        type: SchemaType.STRING,
      },
      description: {
        type: SchemaType.STRING,
      },
      image_url: {
        type: SchemaType.STRING,
      },
      name: {
        type: SchemaType.STRING,
      },
      price: {
        type: SchemaType.STRING,
      },
      rating: {
        type: SchemaType.NUMBER,
      },
    },
    required: [
      "address",
      "description",
      "image_url",
      "name",
      "price",
      "rating",
    ],
  },
};
