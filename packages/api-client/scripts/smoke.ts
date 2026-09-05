/**
 * Offline smoke tests for @smart/api-client (no services, no network).
 * Run: npm run smoke --workspace @smart/api-client
 *
 * Mirrors @smart/shared's smoke setup: plain assertions + tsx, no test
 * framework. The real client is exercised against a STUB fetch, which proves
 * the request plumbing (cookie credentials, URL building, JSON encoding,
 * error mapping, response-schema parsing) without a running gateway.
 */
import {
  ApiClientError,
  createApiClient,
  createMockApiClient,
  isMockModeEnabled,
  MOCK_USER_ID,
  resolveApiBaseUrl,
} from "../src";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A fetch double that records the request and always answers with `response`. */
function stubFetch(response: Response, recorded: RecordedRequest[]) {
  return (input: string, init?: RequestInit): Promise<Response> => {
    recorded.push({ url: input, init });
    return Promise.resolve(response);
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  // --- 1. Base URL resolution (NEXT_PUBLIC_API_URL, explicit option, default) ---
  delete process.env.NEXT_PUBLIC_API_URL;
  assert(resolveApiBaseUrl() === "/api", "default base URL must be the same-origin /api");
  assert(resolveApiBaseUrl({ baseUrl: "http://localhost:8080/api" }) === "http://localhost:8080/api",
    "explicit option must win over the default");
  process.env.NEXT_PUBLIC_API_URL = "http://gateway.test/api";
  assert(resolveApiBaseUrl() === "http://gateway.test/api", "env var must be picked up");
  delete process.env.NEXT_PUBLIC_API_URL;

  process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH = "true";
  assert(isMockModeEnabled(), "mock mode flag on");
  process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH = "false";
  assert(!isMockModeEnabled(), "mock mode flag off");
  delete process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH;

  // --- 2. Request plumbing against a stub fetch ---
  const recorded: RecordedRequest[] = [];
  const client = createApiClient({ fetchImpl: stubFetch(jsonResponse(200, { user: { id: MOCK_USER_ID, name: "Test User" } }), recorded) });

  const me = await client.auth.me();
  assert(me.user.id === MOCK_USER_ID, "me() parses the MeResponse contract");
  assert(recorded[0].url === "/api/auth/me", `GET builds the gateway path, got ${recorded[0].url}`);
  assert(recorded[0].init?.credentials === "include", "every request must carry cookie credentials");

  // POST: request body validated + JSON-encoded (defaults applied by zod parse).
  recorded.length = 0;
  const saveClient = createApiClient({
    fetchImpl: stubFetch(jsonResponse(201, { itineraryId: "555" }), recorded),
  });
  const saved = await saveClient.itineraries.create({
    userId: MOCK_USER_ID,
    // importantNotes deliberately omitted: the shared schema defaults it to []
    itinerary: {
      sourceCountry: "Singapore",
      destination: "Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      estimatedTotalCost: 2450,
      demographics: { currency: "JPY", budgetMin: 1500, budgetMax: 3000, travelerType: "couple", purpose: "leisure" },
      accommodation: [],
      itineraryDays: [],
    },
    weatherForecast: { forecast: [] },
  });
  assert(saved.itineraryId === "555", "create() parses CreateItineraryResponse");
  const sentBody = JSON.parse(String(recorded[0].init?.body));
  assert(recorded[0].url === "/api/itineraries", "POST /api/itineraries path");
  assert(Array.isArray(sentBody.itinerary.importantNotes) && sentBody.itinerary.importantNotes.length === 0,
    "request body is the schema-parsed value (defaults applied), not the raw input");

  // Invalid request payloads never reach fetch (zod rejects client-side).
  recorded.length = 0;
  let rejectedBeforeFetch = false;
  try {
    // Invalid: userId must be a uuid — zod must reject before fetch fires.
    await saveClient.itineraries.create({ userId: "not-a-uuid", itinerary: null, weatherForecast: null });
  } catch (error) {
    rejectedBeforeFetch = error instanceof Error && error.name === "ZodError" && recorded.length === 0;
  }
  assert(rejectedBeforeFetch, "invalid requests must fail zod validation before fetch is called");

  // Error mapping: non-2xx -> ApiClientError with status + parsed body + details.
  recorded.length = 0;
  const notFoundClient = createApiClient({
    fetchImpl: stubFetch(jsonResponse(404, { error: "Itinerary 999 not found" }), recorded),
  });
  let apiError: ApiClientError | undefined;
  try {
    await notFoundClient.itineraries.get("999");
  } catch (error) {
    apiError = error instanceof ApiClientError ? error : undefined;
  }
  assert(apiError?.status === 404, "non-2xx becomes ApiClientError with the HTTP status");
  assert(apiError?.message.includes("Itinerary 999 not found"), "error message comes from the body");
  assert(JSON.stringify(apiError?.body) === JSON.stringify({ error: "Itinerary 999 not found" }), "body kept as-is");

  const invalidClient = createApiClient({
    fetchImpl: stubFetch(jsonResponse(400, { error: "Invalid request body", details: { formErrors: [] } }), []),
  });
  try {
    await invalidClient.itineraries.get("x");
    throw new Error("400 must throw");
  } catch (error) {
    assert(error instanceof ApiClientError && error.status === 400, "400 -> ApiClientError(400)");
    assert(JSON.stringify((error as ApiClientError).details) === JSON.stringify({ formErrors: [] }),
      "details extracted from the error body");
  }

  // Network failure: fetch rejects -> ApiClientError with status 0.
  const offlineClient = createApiClient({ fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
  try {
    await offlineClient.auth.me();
    throw new Error("network failure must throw");
  } catch (error) {
    assert(error instanceof ApiClientError && error.status === 0 && error.isNetworkFailure,
      "fetch rejection -> ApiClientError(0), not an opaque TypeError");
  }

  // Contract break: a 200 with the wrong shape fails the response schema loudly.
  const lyingClient = createApiClient({ fetchImpl: stubFetch(jsonResponse(200, { nope: true }), []) });
  let contractBreak = false;
  try {
    await lyingClient.auth.me();
  } catch (error) {
    contractBreak = error instanceof Error && error.name === "ZodError";
  }
  assert(contractBreak, "a 200 body violating the response schema must throw, not leak garbage");

  // Path parameters are percent-encoded.
  recorded.length = 0;
  const encodedClient = createApiClient({ fetchImpl: stubFetch(jsonResponse(200, { id: "x" }), recorded) });
  await encodedClient.itineraries.get("a b/c");
  assert(recorded[0].url === "/api/itineraries/a%20b%2Fc", `path params encoded, got ${recorded[0].url}`);

  // Bare-array responses (tools list endpoint) parse element-by-element.
  const groupsClient = createApiClient({
    fetchImpl: stubFetch(jsonResponse(200, [{ id: "g-1", name: "Crew", ownerUserId: MOCK_USER_ID, members: [] }]), []),
  });
  const groups = await groupsClient.tools.listGroups();
  assert(groups.length === 1 && groups[0].name === "Crew", "bare GroupDto[] parsed");

  // --- 3. Mock client: same interface, canned behavior, real error semantics ---
  const mock = createMockApiClient();

  const mockMe = await mock.auth.me();
  assert(mockMe.user.name === "Test User" && mockMe.user.email === "testuser@example.com",
    "mock user matches the apps/web mock-auth vocabulary");

  await mock.auth.updateProfile({ name: "Renamed User" });
  assert((await mock.auth.getProfile()).name === "Renamed User", "profile PATCH persists");

  await mock.auth.updateDemographics({ minBudget: 1000, maxBudget: 2000, travelType: "Couple", purpose: "leisure" });
  const demographics = await mock.auth.getDemographics();
  assert(demographics.minBudget === 1000 && demographics.userId === MOCK_USER_ID, "demographics PUT persists");

  const createdItinerary = await mock.itineraries.create({
    userId: MOCK_USER_ID,
    itinerary: {
      sourceCountry: "Singapore",
      destination: "Osaka",
      startDate: "2026-11-01",
      endDate: "2026-11-04",
      estimatedTotalCost: 1800,
      demographics: { currency: "JPY", budgetMin: 1000, budgetMax: 2500, travelerType: "Couple", purpose: "leisure" },
      accommodation: [],
      itineraryDays: [],
    },
    weatherForecast: { forecast: [] },
  });
  const fetchedItinerary = await mock.itineraries.get(createdItinerary.itineraryId);
  assert(fetchedItinerary.destination === "Osaka", "mock create + get round trip");
  const summaries = await mock.itineraries.listForUser(MOCK_USER_ID);
  assert(summaries.itineraries.length === 2, "seeded trip + created trip both listed");

  let mockNotFound: ApiClientError | undefined;
  try {
    await mock.itineraries.get("99999");
  } catch (error) {
    mockNotFound = error instanceof ApiClientError ? error : undefined;
  }
  assert(mockNotFound?.status === 404, "unknown itinerary answers 404 like the real service");

  // Gemini mock data.
  const plan = await mock.gemini.plan({
    form: {
      source: "Singapore", destination: "Tokyo", startDate: "2026-10-01", endDate: "2026-10-05",
      minBudget: 1500, maxBudget: 3000, preferences: [], travelGroup: "Couple", numberPeople: "2",
    },
  });
  assert(plan.itineraryData !== null && plan.flightDetails === null,
    "plan degrades flights to null like the real facade");
  const hotels = await mock.gemini.searchHotels({ query: "Shinjuku" });
  assert(hotels.hotels.length === 1, "hotel search filters the canned list");
  assert((await mock.gemini.listCountries()).items.length === 8, "countries match the gemini-db seed");
  assert((await mock.gemini.listTravelTypes()).items.length === 5, "travel types match the gemini-db seed");

  // Tools mock: invite -> 409 on duplicate -> single-use join -> share -> view -> export.
  const group = await mock.tools.createGroup({ name: "Osaka Crew" });
  const invited = await mock.tools.inviteMember(group.id, { email: "peer@example.com" });
  const inviteToken = invited.members.find((member) => member.email === "peer@example.com")?.inviteToken;
  assert(invited.members.length === 1 && typeof inviteToken === "string", "invite adds a member with a token");

  let duplicate: ApiClientError | undefined;
  try {
    await mock.tools.inviteMember(group.id, { email: "peer@example.com" });
  } catch (error) {
    duplicate = error instanceof ApiClientError ? error : undefined;
  }
  assert(duplicate?.status === 409, "duplicate invite answers 409 like the real service");

  const joined = await mock.tools.joinGroup({ inviteToken: inviteToken as string });
  assert(joined.members[0].status === "joined", "join flips the member to joined");
  try {
    await mock.tools.joinGroup({ inviteToken: inviteToken as string });
    throw new Error("token reuse must fail");
  } catch (error) {
    assert(error instanceof ApiClientError && error.status === 404, "invite tokens are single-use (404 on reuse)");
  }

  const share = await mock.tools.createShare({ itineraryId: "101", recipientEmails: ["peer@example.com"] });
  const sharedView = await mock.tools.getSharedItinerary(share.shareToken);
  assert(sharedView.itineraryId === "101", "share token resolves to the itinerary");
  try {
    await mock.tools.getSharedItinerary("unknown-token");
    throw new Error("unknown token must fail");
  } catch (error) {
    assert(error instanceof ApiClientError && error.status === 404, "unknown share token answers 404");
  }
  // Parity: sharing an itinerary id that does not exist still succeeds (the
  // real service never checks) and only 404s when the link is opened.
  const danglingShare = await mock.tools.createShare({ itineraryId: "does-not-exist", groupId: group.id });
  try {
    await mock.tools.getSharedItinerary(danglingShare.shareToken);
    throw new Error("viewing a dangling share must fail");
  } catch (error) {
    assert(error instanceof ApiClientError && error.status === 404, "dangling share 404s at view time");
  }

  const pdfExport = await mock.tools.exportItineraryPdf("101");
  assert(pdfExport.downloadUrl.includes(pdfExport.storageKey), "export returns a presigned-URL-shaped response");

  // Mock instances are isolated (no state leaking between tests/pages).
  const otherMock = createMockApiClient();
  assert((await otherMock.tools.listGroups()).length === 1, "each mock client starts from fresh canned state");

  console.log("\n@smart/api-client smoke test: ALL GREEN");
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error);
  process.exit(1);
});
