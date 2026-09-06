/**
 * The `ApiClient` interface — the typed contract Phase-2 UI tasks (T2.2–T2.5)
 * consume. Both implementations satisfy it:
 *   - `createApiClient()`  → real HTTP through the gateway (services/*),
 *   - `createMockApiClient()` → canned in-memory data (offline / Cypress).
 *
 * Every request/response type comes from the shared zod DTOs
 * (`@smart/shared/src/dto/*`, re-exported by the browser-safe barrel) so
 * client and services can never drift apart.
 */

/**
 * Types come from the browser-safe barrel for the same reason client.ts
 * documents — one consistent rule for the whole package.
 */
import type {
  GetDemographicsResponse,
  MeResponse,
  UpdateDemographics,
  UpdateProfile,
} from "@smart/shared";
import type {
  CreateItineraryRequest,
  CreateItineraryResponse,
  GetItineraryResponse,
  ListItinerariesResponse,
  UpdateItineraryRequest,
} from "@smart/shared";
import type {
  FlightsSearchRequest,
  FlightsSearchResponse,
  GenerateTextResponseSchema,
  GenerateItineraryRequestSchema,
  HotelsSearchRequest,
  HotelsSearchResponse,
  PlanRequest,
  PlanResponse,
  ReferenceResponse,
} from "@smart/shared";
import type {
  ExportPdfResponse,
  GroupCreate,
  GroupDto,
  JoinGroup,
  MemberInvite,
  ShareCreate,
  ShareResponse,
  SharedItineraryResponse,
} from "@smart/shared";

/**
 * Shared defines the profile/ generate-text contracts as schemas without type
 * aliases; derive the types from what it exports instead of re-declaring the
 * shapes here (a hand copy would silently drift from the zod contract).
 */
export type UserProfile = MeResponse["user"];
export type GenerateTextResponse = ReturnType<typeof GenerateTextResponseSchema.parse>;
export type GenerateItineraryRequest = ReturnType<typeof GenerateItineraryRequestSchema.parse>;

export interface ApiClient {
  /** Authentication Service (diagram: "Authentication Service — User Profile"). */
  auth: {
    /** GET /api/auth/me — upserts the caller from JWT claims, returns profile + demographics. */
    me(): Promise<MeResponse>;
    /** GET /api/auth/profile — the caller's stored profile row. */
    getProfile(): Promise<UserProfile>;
    /** PATCH /api/auth/profile — partial update (name, avatar_url). */
    updateProfile(profile: UpdateProfile): Promise<UserProfile>;
    /** GET /api/auth/demographics — saved travel preferences (nulls when never saved). */
    getDemographics(): Promise<GetDemographicsResponse>;
    /** PUT /api/auth/demographics — full replace of the travel preferences. */
    updateDemographics(demographics: UpdateDemographics): Promise<GetDemographicsResponse>;
  };

  /** Itinerary Service (diagram: "Itinerary Service"). */
  itineraries: {
    /** POST /api/itineraries — save a full aggregate; responds with the new id. */
    create(request: CreateItineraryRequest): Promise<CreateItineraryResponse>;
    /** PUT /api/itineraries/:id — replace an aggregate (children are swapped wholesale). */
    update(itineraryId: string, request: UpdateItineraryRequest): Promise<CreateItineraryResponse>;
    /** GET /api/itineraries/:id — the full aggregate incl. days/activities/accommodation. */
    get(itineraryId: string): Promise<GetItineraryResponse>;
    /** GET /api/itineraries/user/:userId — list summaries for a user. */
    listForUser(userId: string): Promise<ListItinerariesResponse>;
    /** DELETE /api/itineraries/:id — delete an aggregate and (FK cascade) its children. */
    remove(itineraryId: string): Promise<void>;
    /** DELETE /api/itineraries/accommodation/:accommodationId — remove one stay. */
    removeAccommodation(accommodationId: string): Promise<void>;
  };

  /** Gemini Service (diagram: "Gemini Service — Hotel Service"). */
  gemini: {
    /** POST /api/gemini/plan — the ItineraryPlannerFacade: itinerary + weather + flights. */
    plan(request: PlanRequest): Promise<PlanResponse>;
    /** POST /api/gemini/generate-itinerary — AI text only (`text` null when generation failed). */
    generateItinerary(request: GenerateItineraryRequest): Promise<GenerateTextResponse>;
    /** POST /api/gemini/generate-weather — AI weather text (`text` null when generation failed). */
    generateWeather(request: GenerateItineraryRequest): Promise<GenerateTextResponse>;
    /** POST /api/gemini/hotels/search — schema-constrained hotel suggestions. */
    searchHotels(request: HotelsSearchRequest): Promise<HotelsSearchResponse>;
    /** POST /api/gemini/flights/search — Amadeus offers (degrades to an empty list). */
    searchFlights(request: FlightsSearchRequest): Promise<FlightsSearchResponse>;
    /** GET /api/gemini/reference/countries — dropdown data from gemini-db. */
    listCountries(): Promise<ReferenceResponse>;
    /** GET /api/gemini/reference/travel-types — dropdown data from gemini-db. */
    listTravelTypes(): Promise<ReferenceResponse>;
  };

  /** Tools Service (diagram: "Tools Service — Export PDF, Sharing"). */
  tools: {
    /** POST /api/tools/groups — create a group owned by the caller. */
    createGroup(request: GroupCreate): Promise<GroupDto>;
    /** GET /api/tools/groups — a BARE array (no list wrapper exists in shared). */
    listGroups(): Promise<GroupDto[]>;
    /** GET /api/tools/groups/:id — one group + members (404 unless owner/member/invitee). */
    getGroup(groupId: string): Promise<GroupDto>;
    /** DELETE /api/tools/groups/:id — owner-only; members rows go with it. */
    deleteGroup(groupId: string): Promise<void>;
    /** POST /api/tools/groups/:id/invites — owner invites one email (409 on duplicates). */
    inviteMember(groupId: string, invite: MemberInvite): Promise<GroupDto>;
    /** POST /api/tools/groups/join — spend a single-use invite token; 404 when used/unknown. */
    joinGroup(request: JoinGroup): Promise<GroupDto>;
    /** POST /api/tools/shares — create a share link + notify the audience by email. */
    createShare(request: ShareCreate): Promise<ShareResponse>;
    /** GET /api/tools/shares/:token — resolve a share token to the read-only itinerary. */
    getSharedItinerary(shareToken: string): Promise<SharedItineraryResponse>;
    /** GET /api/tools/export/itinerary/:id/pdf — MinIO presigned URL for the browser to download. */
    exportItineraryPdf(itineraryId: string): Promise<ExportPdfResponse>;
  };
}
