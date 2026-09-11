# @smart/api-client

The typed browser client for the Smart Itinerary platform — the one place the
Next.js app (`apps/web`) talks to the microservices. It wraps `fetch`, reuses
the shared zod contracts from `@smart/shared`, and is the dependency of the
Phase-2 UI tasks (T2.2 auth, T2.3 itinerary/hotels, T2.4 profile, T2.5 tools).

**Diagram mapping:** the "Clients — Web" box. Every call goes
`apps/web → (Next.js rewrite /api/*) → gateway:8080 → service`, with the
`si_session` httpOnly cookie riding along on every request.

## Usage

```ts
import { createApiClient, createMockApiClient, isMockModeEnabled } from "@smart/api-client";

// Real HTTP through the gateway (same-origin /api by default).
const api = createApiClient();

// Offline / Cypress: canned in-memory data, identical interface.
const mock = isMockModeEnabled() ? createMockApiClient() : createApiClient();

// Every method is typed by the shared zod DTOs and async:
const me = await api.auth.me();                       // MeResponse
const { itineraryId } = await api.itineraries.create(request);
const plan = await api.gemini.plan(planRequest);      // itineraryData | weatherData | flightDetails
const group = await api.tools.createGroup({ name: "Tokyo Crew" });

// Failures are typed, not string-matched:
try {
  await api.itineraries.get("999");
} catch (error) {
  if (error instanceof ApiClientError) {
    error.status;      // 404 — or 0 when the network itself failed
    error.body;        // the parsed `{ error, details? }` body
    error.details;     // zod field errors on 400s
  }
}
```

## What each layer does

| File | Purpose |
|---|---|
| `src/env.ts` | Base URL resolution: explicit option → `NEXT_PUBLIC_API_URL` → same-origin `/api` (the Next.js rewrite forwards `/api/*` to the gateway, so the relative default is correct and no origin is configured per deploy) |
| `src/errors.ts` | `ApiClientError` — `status` (0 = network failure), parsed `body`, `details` |
| `src/request.ts` | The one fetch wrapper: `credentials: "include"` always, JSON encode/decode, response-schema parsing, error mapping |
| `src/types.ts` | The `ApiClient` interface — implemented by both the real and the mock client |
| `src/client.ts` | `createApiClient()` — one method per gateway-forwarded endpoint |
| `src/mock/` | `createMockApiClient()` + canned data for offline / Cypress development |

## Endpoints (all under the base URL, forwarded by the gateway path-intact)

| Method | Client call | Backend |
|---|---|---|
| GET | `auth.me()` | auth-service `GET /api/auth/me` |
| GET / PATCH | `auth.getProfile()` / `auth.updateProfile()` | auth-service `/api/auth/profile` |
| GET / PUT | `auth.getDemographics()` / `auth.updateDemographics()` | auth-service `/api/auth/demographics` |
| POST | `itineraries.create()` | itinerary-service `POST /api/itineraries` |
| PUT | `itineraries.update(id, …)` | itinerary-service `PUT /api/itineraries/:id` |
| GET | `itineraries.get(id)` / `itineraries.listForUser(userId)` | itinerary-service `/api/itineraries/:id`, `/user/:userId` |
| DELETE | `itineraries.remove(id)` / `itineraries.removeAccommodation(id)` | itinerary-service `DELETE …` |
| POST | `gemini.plan()`, `gemini.generateItinerary()`, `gemini.generateWeather()`, `gemini.searchHotels()`, `gemini.searchFlights()` | gemini-service `POST /api/gemini/*` |
| GET | `gemini.listCountries()`, `gemini.listTravelTypes()` | gemini-service `GET /api/gemini/reference/*` |
| POST / GET | `tools.createGroup()`, `tools.listGroups()` (bare `GroupDto[]`), `tools.getGroup(id)` | tools-service `/api/tools/groups` |
| POST | `tools.inviteMember(groupId, …)`, `tools.joinGroup(…)` | tools-service `/api/tools/groups/:id/invites`, `/groups/join` |
| POST / GET | `tools.createShare()`, `tools.getSharedItinerary(token)` | tools-service `/api/tools/shares` |
| GET | `tools.exportItineraryPdf(id)` → `{ downloadUrl, expiresAt, storageKey }` | tools-service `GET /api/tools/export/itinerary/:id/pdf` |

## Mock mode

`createMockApiClient()` implements the same `ApiClient` interface over
in-memory state seeded with the same fixtures the rest of the platform fakes:
the `Test User` mock-auth account (`NEXT_PUBLIC_ENABLE_MOCK_AUTH`, same UUID as
`db/init/auth-service.sql`), the Tokyo demo trip, and the reference rows from
`db/init/gemini-service.sql`. It mirrors real behaviour where the UI can see
it: 404s for unknown ids, 409 on duplicate invites, single-use invite tokens,
`flightDetails: null` on plans, and no itinerary-existence check when sharing
(the 404 surfaces at view time, like tools-service).

## Environment variables (browser-safe)

| Var | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` | Base URL for every call. The **only** `NEXT_PUBLIC_` var this package reads — a base URL is configuration, not a secret. |
| `NEXT_PUBLIC_ENABLE_MOCK_AUTH` | — | Web app's mock flag; `isMockModeEnabled()` reads it so callers can pick the mock client in Cypress/offline runs. |

## Verify (offline)

```bash
npm run typecheck --workspace @smart/api-client   # tsc --noEmit
npm run smoke --workspace @smart/api-client       # offline tests (stub fetch + mock client)
```
