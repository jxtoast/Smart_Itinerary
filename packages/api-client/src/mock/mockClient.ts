/**
 * `createMockApiClient()` — the mock-mode twin of `createApiClient()`
 * (diagram: "Clients — Web" in offline / Cypress runs).
 *
 * Implements the exact same `ApiClient` interface over in-memory state, so
 * pages developed against it need no running stack (no docker compose). It
 * deliberately mirrors the real services' BEHAVIOUR where the UI can observe
 * it: request bodies are validated with the same shared schemas, unknown ids
 * answer 404, duplicate invites 409, invite tokens are single-use, and —
 * parity with tools-service — creating a share does NOT check that the
 * itinerary exists (the 404 surfaces at view time instead).
 */

// Contracts come from the shared DTO files (NOT the @smart/shared barrel —
// see client.ts: the barrel drags server adapters into the browser bundle).
import { UpdateProfileSchema, UserDemographicsSchema } from "@smart/shared/src/dto/auth";
import { CreateItineraryRequestSchema } from "@smart/shared/src/dto/itineraries";
import { HotelsSearchRequestSchema, PlanRequestSchema } from "@smart/shared/src/dto/gemini";
import {
  GroupCreateSchema,
  JoinGroupSchema,
  MemberInviteSchema,
  ShareCreateSchema,
} from "@smart/shared/src/dto/tools";
import type { GroupDto } from "@smart/shared/src/dto/tools";
import type { MeResponse } from "@smart/shared/src/dto/auth";
import { ApiClientError } from "../errors";
import type { ApiClient, GenerateItineraryRequest } from "../types";
import {
  MOCK_COUNTRIES,
  MOCK_DEMOGRAPHICS,
  MOCK_HOTELS,
  MOCK_TRAVEL_TYPES,
  MOCK_USER,
  MOCK_USER_ID,
  createInitialMockState,
  type MockApiState,
} from "./mockData";

/** Mock stand-in for tools-service's WEB_PUBLIC_URL default (share links point at the web origin). */
const MOCK_WEB_PUBLIC_URL = "http://localhost:3000";

/** Mock presign TTL matching tools-service's 15-minute PDF download links. */
const MOCK_PRESIGN_TTL_MS = 15 * 60 * 1000;

/** Build a mock client backed by fresh in-memory state (canned data in mockData.ts). */
export function createMockApiClient(): ApiClient {
  const state = createInitialMockState();

  return {
    auth: {
      me: async (): Promise<MeResponse> => ({
        // Mirrors auth-service: /me attaches the stored demographics (or null).
        user: { ...state.profile, userDemographics: state.demographics ?? null },
      }),
      getProfile: async () => ({ ...state.profile }),
      updateProfile: async (profile) => {
        const parsed = UpdateProfileSchema.parse(profile);
        state.profile = { ...state.profile, ...parsed };
        return { ...state.profile };
      },
      getDemographics: async () => ({ ...state.demographics }),
      updateDemographics: async (demographics) => {
        // PUT semantics: full replace — absent optionals become null/empty.
        const parsed = UserDemographicsSchema.parse(demographics);
        state.demographics = {
          userId: MOCK_USER_ID,
          minBudget: parsed.minBudget ?? null,
          maxBudget: parsed.maxBudget ?? null,
          travelType: parsed.travelType,
          purpose: parsed.purpose,
          numberOfPeople: parsed.numberOfPeople,
        };
        return { ...state.demographics };
      },
    },

    itineraries: {
      create: async (request) => {
        const parsed = CreateItineraryRequestSchema.parse(request);
        const itineraryId = String(state.nextItineraryId++);
        state.itineraries.set(itineraryId, {
          ...parsed.itinerary,
          id: itineraryId,
          userId: parsed.userId,
          weatherForecast: parsed.weatherForecast,
        });
        return { itineraryId };
      },
      update: async (itineraryId, request) => {
        const parsed = CreateItineraryRequestSchema.parse(request);
        if (!state.itineraries.has(itineraryId)) {
          throw notFound(`Itinerary ${itineraryId} not found`);
        }
        // Parity with the real PUT: children are replaced wholesale.
        state.itineraries.set(itineraryId, {
          ...parsed.itinerary,
          id: itineraryId,
          userId: parsed.userId,
          weatherForecast: parsed.weatherForecast,
        });
        return { itineraryId };
      },
      get: async (itineraryId) => {
        const itinerary = state.itineraries.get(itineraryId);
        if (!itinerary) {
          throw notFound(`Itinerary ${itineraryId} not found`);
        }
        return structuredClone(itinerary);
      },
      listForUser: async () => ({
        itineraries: [...state.itineraries.values()].map((itinerary) => ({
          id: itinerary.id,
          destination: itinerary.destination,
          start_date: itinerary.startDate,
          end_date: itinerary.endDate,
        })),
      }),
      remove: async (itineraryId) => {
        if (!state.itineraries.delete(itineraryId)) {
          throw notFound(`Itinerary ${itineraryId} not found`);
        }
      },
      removeAccommodation: async (accommodationId) => {
        const numericId = Number(accommodationId);
        for (const itinerary of state.itineraries.values()) {
          const index = itinerary.accommodation.findIndex((stay) => stay.id === numericId);
          if (index !== -1) {
            itinerary.accommodation.splice(index, 1);
            return;
          }
        }
        throw notFound(`Accommodation ${accommodationId} not found`);
      },
    },

    gemini: {
      plan: async (request) => {
        const parsed = PlanRequestSchema.parse(request);
        // flightDetails null mirrors the designed degradation when the flight
        // provider is unavailable (gemini-service answers the same way).
        return {
          itineraryData: buildMockItineraryData(parsed.form.destination),
          weatherData: { forecast: [], destination: parsed.form.destination },
          flightDetails: null,
        };
      },
      generateItinerary: async (request: GenerateItineraryRequest) => ({
        text: `Mock ${request.form.travelGroup} itinerary for ${request.form.destination} ` +
          `(${request.form.startDate} to ${request.form.endDate}).`,
      }),
      generateWeather: async (request: GenerateItineraryRequest) => ({
        text: `Mock weather for ${request.form.destination}: 18–24°C, partly cloudy.`,
      }),
      searchHotels: async (request) => {
        const { query } = HotelsSearchRequestSchema.parse(request);
        const needle = query.toLowerCase();
        return {
          hotels: MOCK_HOTELS.filter(
            (hotel) =>
              hotel.name.toLowerCase().includes(needle) ||
              hotel.address.toLowerCase().includes(needle)
          ),
        };
      },
      searchFlights: async () => ({
        flights: [
          {
            id: "mock-offer-1",
            price: { total: "620", currency: "SGD" },
            itineraries: [
              {
                duration: "PT7H30M",
                segments: [
                  { departure: { iataCode: "SIN" }, arrival: { iataCode: "NRT" } },
                ],
              },
            ],
          },
        ],
      }),
      listCountries: async () => ({ items: MOCK_COUNTRIES }),
      listTravelTypes: async () => ({ items: MOCK_TRAVEL_TYPES }),
    },

    tools: {
      createGroup: async (request) => {
        const parsed = GroupCreateSchema.parse(request);
        const groupId = `g-${state.nextGroupId++}`;
        const group: GroupDto = {
          id: groupId,
          name: parsed.name,
          ownerUserId: MOCK_USER_ID,
          members: [],
        };
        state.groups.set(groupId, group);
        return structuredClone(group);
      },
      listGroups: async () =>
        [...state.groups.values()]
          .filter((group) => isGroupVisibleToMockUser(group))
          .map((group) => structuredClone(group)),
      getGroup: async (groupId) => {
        const group = state.groups.get(groupId);
        if (!group || !isGroupVisibleToMockUser(group)) {
          throw notFound(`Group ${groupId} not found`);
        }
        return structuredClone(group);
      },
      deleteGroup: async (groupId) => {
        const group = state.groups.get(groupId);
        if (!group) {
          throw notFound(`Group ${groupId} not found`);
        }
        if (group.ownerUserId !== MOCK_USER_ID) {
          throw forbidden("Only the group owner can delete a group");
        }
        state.groups.delete(groupId);
      },
      inviteMember: async (groupId, invite) => {
        const group = requireOwnedGroup(state, groupId);
        const parsed = MemberInviteSchema.parse(invite);
        const existing = group.members.find((member) => member.email === parsed.email);
        if (existing) {
          // Same 409 the real service answers (pre-check + UNIQUE constraint).
          throw new ApiClientError(409, `${parsed.email} is already ${existing.status} in this group`);
        }
        group.members.push({
          email: parsed.email,
          status: "invited",
          inviteToken: `mock-invite-token-${state.nextInviteToken++}`,
        });
        return structuredClone(group);
      },
      joinGroup: async (request) => {
        const parsed = JoinGroupSchema.parse(request);
        for (const group of state.groups.values()) {
          const member = group.members.find(
            (candidate) => candidate.inviteToken === parsed.inviteToken
          );
          if (member) {
            // Single use: the token is nulled, so a second join 404s below.
            member.status = "joined";
            member.userId = MOCK_USER_ID;
            member.inviteToken = undefined;
            return structuredClone(group);
          }
        }
        throw notFound("Invalid or already-used invite token");
      },
      createShare: async (request) => {
        const parsed = ShareCreateSchema.parse(request);
        // Deliberately no itinerary-existence check — parity with tools-service.
        const shareToken = `mock-share-token-${state.nextShareToken++}`;
        state.shares.set(shareToken, {
          itineraryId: parsed.itineraryId,
          sharedAt: new Date().toISOString(),
        });
        return {
          shareToken,
          shareUrl: `${MOCK_WEB_PUBLIC_URL}/shared/${shareToken}`,
        };
      },
      getSharedItinerary: async (shareToken) => {
        const share = state.shares.get(shareToken);
        if (!share) {
          throw notFound("Share link not found");
        }
        const itinerary = state.itineraries.get(share.itineraryId);
        if (!itinerary) {
          // View-time existence check (the create path never verified it).
          throw notFound(`Itinerary ${share.itineraryId} not found`);
        }
        return {
          itineraryId: share.itineraryId,
          sharedAt: share.sharedAt,
          itinerary: structuredClone(itinerary),
        };
      },
      exportItineraryPdf: async (itineraryId) => {
        if (!state.itineraries.has(itineraryId)) {
          throw notFound(`Itinerary ${itineraryId} not found`);
        }
        const storageKey = `mock-exports/itinerary-${itineraryId}-${state.nextStorageKey++}.pdf`;
        return {
          downloadUrl: `https://mock-minio.local/smart-exports/${storageKey}?mockPresign=1`,
          expiresAt: new Date(Date.now() + MOCK_PRESIGN_TTL_MS).toISOString(),
          storageKey,
        };
      },
    },
  };
}

function notFound(message: string): ApiClientError {
  return new ApiClientError(404, message);
}

function forbidden(message: string): ApiClientError {
  return new ApiClientError(403, message);
}

/** Pending invitees match by the invite token's email — the mock user's email. */
function isGroupVisibleToMockUser(group: GroupDto): boolean {
  return (
    group.ownerUserId === MOCK_USER_ID ||
    group.members.some((member) => member.userId === MOCK_USER_ID || member.email === MOCK_USER.email)
  );
}

/** 404 for unknown groups, 403 when the mock user is not the owner. */
function requireOwnedGroup(state: MockApiState, groupId: string): GroupDto {
  const group = state.groups.get(groupId);
  if (!group) {
    throw notFound(`Group ${groupId} not found`);
  }
  if (group.ownerUserId !== MOCK_USER_ID) {
    throw forbidden("Only the group owner can invite members");
  }
  return group;
}

/** Minimal plan payload — shaped like the facade's itinerary data. */
function buildMockItineraryData(destination: string) {
  return {
    sourceCountry: "Singapore",
    destination,
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    estimatedTotalCost: 2450,
    importantNotes: [`Mock AI plan for ${destination}`],
    itineraryDays: [],
  };
}
