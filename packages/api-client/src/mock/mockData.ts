/**
 * Canned data for `createMockApiClient()` — offline / Cypress development
 * without any running service (docker compose not needed).
 *
 * Vocabulary matches what apps/web already fakes: the same mock user as
 * `UserService.getUserSession()` under `NEXT_PUBLIC_ENABLE_MOCK_AUTH`, the
 * demo trip used by the @smart/shared smoke test, and the reference rows
 * seeded by `db/init/gemini-service.sql`.
 */

// Subpath contract imports, not the barrel (see client.ts for why).
import type { CreateItineraryRequest } from "@smart/shared/src/dto/itineraries";
import type { GetDemographicsResponse, MeResponse } from "@smart/shared/src/dto/auth";
import type { GroupDto } from "@smart/shared/src/dto/tools";
import type { HotelDto } from "@smart/shared/src/dto/gemini";

/**
 * Stored aggregate in the mock: the shared itinerary payload (the request
 * schema's OUTPUT type — defaults applied) plus the server-assigned id/userId
 * and the verbatim weather JSONB. Mirrors the camelCase aggregate
 * itinerary-service's GET /:id returns (see its repository mapping helpers).
 */
export type MockItinerary = CreateItineraryRequest["itinerary"] & {
  id: string;
  userId: string;
  weatherForecast: unknown;
};

/** Same UUID as the seeded mock-auth user (db/init/auth-service.sql, UserService.ts). */
export const MOCK_USER_ID = "1b9472e1-a85e-43bf-9898-6f44e2b20809";

/** The fake session user apps/web serves in mock mode. */
export const MOCK_USER: MeResponse["user"] = {
  id: MOCK_USER_ID,
  name: "Test User",
  email: "testuser@example.com",
  avatar_url: "",
};

/** Same "never saved yet" state auth-service answers for a fresh user. */
export const MOCK_DEMOGRAPHICS: GetDemographicsResponse = {
  userId: MOCK_USER_ID,
  minBudget: null,
  maxBudget: null,
  travelType: "",
  purpose: "",
};

/** One saved aggregate, shaped like itinerary-service's GET /:id response. */
export const MOCK_ITINERARY: MockItinerary = {
  id: "101",
  userId: MOCK_USER_ID,
  sourceCountry: "Singapore",
  destination: "Tokyo",
  startDate: "2026-10-01",
  endDate: "2026-10-05",
  estimatedTotalCost: 2450,
  importantNotes: ["Bring passport"],
  demographics: { currency: "JPY", budgetMin: 1500, budgetMax: 3000, travelerType: "couple", purpose: "leisure" },
  accommodation: [{ id: 201, name: "Shinjuku Grand Hotel", estimatedCost: 180 }],
  itineraryDays: [
    {
      id: 301,
      date: "2026-10-01",
      location: "Shibuya",
      description: "Arrival and evening crossing",
      activities: [{ id: 401, name: "Shibuya Crossing", details: "", timing: "", estimatedCost: 0 }],
    },
    {
      id: 302,
      date: "2026-10-02",
      location: "Asakusa",
      description: "Temples and street food",
      activities: [{ id: 402, name: "Senso-ji Temple", details: "", timing: "", estimatedCost: 0 }],
    },
  ],
  weatherForecast: { forecast: [] },
};

/** Schema-constrained hotel suggestions, as gemini-service returns them. */
export const MOCK_HOTELS: HotelDto[] = [
  {
    name: "Shinjuku Grand Hotel",
    address: "1-1 Shinjuku, Tokyo",
    description: "Central hotel a short walk from the station.",
    image_url: "https://example.com/hotels/shinjuku-grand.jpg",
    price: "$180",
    rating: 4.5,
  },
  {
    name: "Asakusa Riverside Inn",
    address: "2-11 Asakusa, Taito-ku, Tokyo",
    description: "Quiet inn near Senso-ji with river views.",
    image_url: "https://example.com/hotels/asakusa-riverside.jpg",
    price: "$95",
    rating: 4.1,
  },
];

/** Reference rows — the same values db/init/gemini-service.sql seeds. */
export const MOCK_COUNTRIES = [
  { id: 1, country_code: "SG", country_name: "Singapore" },
  { id: 2, country_code: "JP", country_name: "Japan" },
  { id: 3, country_code: "MY", country_name: "Malaysia" },
  { id: 4, country_code: "TH", country_name: "Thailand" },
  { id: 5, country_code: "ID", country_name: "Indonesia" },
  { id: 6, country_code: "KR", country_name: "South Korea" },
  { id: 7, country_code: "AU", country_name: "Australia" },
  { id: 8, country_code: "NZ", country_name: "New Zealand" },
];

export const MOCK_TRAVEL_TYPES = [
  { id: 1, type_name: "Solo", type_code: "solo", number_of_people: "1" },
  { id: 2, type_name: "Couple", type_code: "couple", number_of_people: "2" },
  { id: 3, type_name: "Family", type_code: "family", number_of_people: "3-5" },
  { id: 4, type_name: "Friends", type_code: "friends", number_of_people: "4-8" },
  { id: 5, type_name: "Business", type_code: "business", number_of_people: "1-2" },
];

/** Deep-enough copy so tests/multiple mocks never share one object graph. */
function cloneMockStateValues<T>(value: T): T {
  return structuredClone(value);
}

/** In-memory group row — mirrors the real GroupDto (inviteToken on members). */
export type MockGroup = GroupDto;

/**
 * Mutable slice the mock client works on: fresh per `createMockApiClient()`
 * call, so one Cypress test cannot leak groups into the next.
 */
export interface MockApiState {
  profile: MeResponse["user"];
  demographics: GetDemographicsResponse;
  itineraries: Map<string, MockItinerary>;
  nextItineraryId: number;
  groups: Map<string, MockGroup>;
  nextGroupId: number;
  nextInviteToken: number;
  shares: Map<string, { itineraryId: string; sharedAt: string }>;
  nextShareToken: number;
  nextStorageKey: number;
}

/** Build the initial state: the seeded user, trip and one empty owner group. */
export function createInitialMockState(): MockApiState {
  const seededGroupId = "g-1";
  const groups = new Map<string, MockGroup>();
  groups.set(seededGroupId, {
    id: seededGroupId,
    name: "Tokyo Trip Crew",
    ownerUserId: MOCK_USER_ID,
    members: [],
  });

  const itineraries = new Map<string, MockItinerary>();
  itineraries.set(MOCK_ITINERARY.id, cloneMockStateValues(MOCK_ITINERARY));

  return {
    profile: cloneMockStateValues(MOCK_USER),
    demographics: cloneMockStateValues(MOCK_DEMOGRAPHICS),
    itineraries,
    nextItineraryId: 102,
    groups,
    nextGroupId: 2,
    nextInviteToken: 1,
    shares: new Map(),
    nextShareToken: 1,
    nextStorageKey: 1,
  };
}
