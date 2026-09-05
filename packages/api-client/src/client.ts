/**
 * `createApiClient()` — the real browser client (diagram: "Clients — Web" →
 * "API Gateway").
 *
 * One method per gateway-forwarded endpoint. Each method:
 *   1. validates its request payload with the shared request *Schema (the
 *      parsed value — defaults applied — is what goes on the wire),
 *   2. issues the request through `requestJson` (cookie credentials, JSON),
 *   3. parses the response with the shared response *Schema.
 *
 * Path prefixes mirror the gateway route table (services/gateway/src/
 * upstreams.ts): the gateway forwards `/api/<area>/*` UNCHANGED, so the
 * service-mounted paths are exactly what this client calls.
 */

import {
  CreateItineraryRequestSchema,
  CreateItineraryResponseSchema,
  FlightsSearchRequestSchema,
  FlightsSearchResponseSchema,
  GenerateItineraryRequestSchema,
  GenerateTextResponseSchema,
  GetDemographicsResponseSchema,
  GetItineraryResponseSchema,
  GroupCreateSchema,
  GroupDtoSchema,
  HotelsSearchRequestSchema,
  HotelsSearchResponseSchema,
  JoinGroupSchema,
  ListItinerariesResponseSchema,
  MeResponseSchema,
  MemberInviteSchema,
  PlanRequestSchema,
  PlanResponseSchema,
  ReferenceResponseSchema,
  ShareCreateSchema,
  ShareResponseSchema,
  SharedItineraryResponseSchema,
  ExportPdfResponseSchema,
  UpdateItineraryRequestSchema,
  UpdateProfileSchema,
  UserDemographicsSchema,
  UserProfileSchema,
} from "@smart/shared";
import { ApiClientOptions, resolveApiBaseUrl } from "./env";
import { encodePathSegment, requestJson, type FetchLike } from "./request";
import type { ApiClient } from "./types";

/** Public path prefix of each service area (see gateway upstreams.ts). */
const AUTH_AREA = "/auth";
const ITINERARIES_AREA = "/itineraries";
const GEMINI_AREA = "/gemini";
const TOOLS_AREA = "/tools";

export interface RealApiClientOptions extends ApiClientOptions {
  /**
   * Injectable fetch implementation (tests / Cypress route interception).
   * Defaults to the browser's global fetch.
   */
  fetchImpl?: FetchLike;
}

/**
 * Build the real API client. The base URL resolves to the same-origin `/api`
 * unless `NEXT_PUBLIC_API_URL` (or an explicit option) says otherwise —
 * see env.ts for why a relative default is correct.
 */
export function createApiClient(options: RealApiClientOptions = {}): ApiClient {
  const baseUrl = resolveApiBaseUrl(options);
  const fetchImpl = options.fetchImpl;

  return {
    auth: {
      me: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${AUTH_AREA}/me`,
          responseSchema: MeResponseSchema,
          fetchImpl,
        }),
      getProfile: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${AUTH_AREA}/profile`,
          responseSchema: UserProfileSchema,
          fetchImpl,
        }),
      updateProfile: (profile) =>
        requestJson({
          baseUrl,
          method: "PATCH",
          path: `${AUTH_AREA}/profile`,
          body: UpdateProfileSchema.parse(profile),
          responseSchema: UserProfileSchema,
          fetchImpl,
        }),
      getDemographics: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${AUTH_AREA}/demographics`,
          responseSchema: GetDemographicsResponseSchema,
          fetchImpl,
        }),
      updateDemographics: (demographics) =>
        requestJson({
          baseUrl,
          method: "PUT",
          path: `${AUTH_AREA}/demographics`,
          body: UserDemographicsSchema.parse(demographics),
          responseSchema: GetDemographicsResponseSchema,
          fetchImpl,
        }),
    },

    itineraries: {
      create: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: ITINERARIES_AREA,
          body: CreateItineraryRequestSchema.parse(request),
          responseSchema: CreateItineraryResponseSchema,
          fetchImpl,
        }),
      update: (itineraryId, request) =>
        requestJson({
          baseUrl,
          method: "PUT",
          path: `${ITINERARIES_AREA}/${encodePathSegment(itineraryId)}`,
          body: UpdateItineraryRequestSchema.parse(request),
          responseSchema: CreateItineraryResponseSchema,
          fetchImpl,
        }),
      get: (itineraryId) =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${ITINERARIES_AREA}/${encodePathSegment(itineraryId)}`,
          responseSchema: GetItineraryResponseSchema,
          fetchImpl,
        }),
      listForUser: (userId) =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${ITINERARIES_AREA}/user/${encodePathSegment(userId)}`,
          responseSchema: ListItinerariesResponseSchema,
          fetchImpl,
        }),
      remove: (itineraryId) =>
        requestJson({
          baseUrl,
          method: "DELETE",
          path: `${ITINERARIES_AREA}/${encodePathSegment(itineraryId)}`,
          fetchImpl,
        }),
      removeAccommodation: (accommodationId) =>
        requestJson({
          baseUrl,
          method: "DELETE",
          path: `${ITINERARIES_AREA}/accommodation/${encodePathSegment(accommodationId)}`,
          fetchImpl,
        }),
    },

    gemini: {
      plan: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${GEMINI_AREA}/plan`,
          body: PlanRequestSchema.parse(request),
          responseSchema: PlanResponseSchema,
          fetchImpl,
        }),
      generateItinerary: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${GEMINI_AREA}/generate-itinerary`,
          body: GenerateItineraryRequestSchema.parse(request),
          responseSchema: GenerateTextResponseSchema,
          fetchImpl,
        }),
      generateWeather: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${GEMINI_AREA}/generate-weather`,
          body: GenerateItineraryRequestSchema.parse(request),
          responseSchema: GenerateTextResponseSchema,
          fetchImpl,
        }),
      searchHotels: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${GEMINI_AREA}/hotels/search`,
          body: HotelsSearchRequestSchema.parse(request),
          responseSchema: HotelsSearchResponseSchema,
          fetchImpl,
        }),
      searchFlights: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${GEMINI_AREA}/flights/search`,
          body: FlightsSearchRequestSchema.parse(request),
          responseSchema: FlightsSearchResponseSchema,
          fetchImpl,
        }),
      listCountries: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${GEMINI_AREA}/reference/countries`,
          responseSchema: ReferenceResponseSchema,
          fetchImpl,
        }),
      listTravelTypes: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${GEMINI_AREA}/reference/travel-types`,
          responseSchema: ReferenceResponseSchema,
          fetchImpl,
        }),
    },

    tools: {
      createGroup: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${TOOLS_AREA}/groups`,
          body: GroupCreateSchema.parse(request),
          responseSchema: GroupDtoSchema,
          fetchImpl,
        }),
      listGroups: () =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${TOOLS_AREA}/groups`,
          // A bare GroupDto[] — the service has no list-wrapper contract, and
          // building z.array() here would mean importing zod directly (it is
          // meant to arrive via @smart/shared), so parse element-by-element.
          responseSchema: { parse: parseGroupArray },
          fetchImpl,
        }),
      getGroup: (groupId) =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${TOOLS_AREA}/groups/${encodePathSegment(groupId)}`,
          responseSchema: GroupDtoSchema,
          fetchImpl,
        }),
      deleteGroup: (groupId) =>
        requestJson({
          baseUrl,
          method: "DELETE",
          path: `${TOOLS_AREA}/groups/${encodePathSegment(groupId)}`,
          fetchImpl,
        }),
      inviteMember: (groupId, invite) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${TOOLS_AREA}/groups/${encodePathSegment(groupId)}/invites`,
          body: MemberInviteSchema.parse(invite),
          responseSchema: GroupDtoSchema,
          fetchImpl,
        }),
      joinGroup: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${TOOLS_AREA}/groups/join`,
          body: JoinGroupSchema.parse(request),
          responseSchema: GroupDtoSchema,
          fetchImpl,
        }),
      createShare: (request) =>
        requestJson({
          baseUrl,
          method: "POST",
          path: `${TOOLS_AREA}/shares`,
          body: ShareCreateSchema.parse(request),
          responseSchema: ShareResponseSchema,
          fetchImpl,
        }),
      getSharedItinerary: (shareToken) =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${TOOLS_AREA}/shares/${encodePathSegment(shareToken)}`,
          responseSchema: SharedItineraryResponseSchema,
          fetchImpl,
        }),
      exportItineraryPdf: (itineraryId) =>
        requestJson({
          baseUrl,
          method: "GET",
          path: `${TOOLS_AREA}/export/itinerary/${encodePathSegment(itineraryId)}/pdf`,
          responseSchema: ExportPdfResponseSchema,
          fetchImpl,
        }),
    },
  };
}

/** Validate a bare array response element-by-element with the shared GroupDtoSchema. */
function parseGroupArray(data: unknown) {
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected an array of groups, got: ${typeof data}`);
  }
  return data.map((group) => GroupDtoSchema.parse(group));
}
