# gemini-service (port 8083)

The Gemini Service is the platform's AI engine — the **"Gemini Service (Hotel
Service)"** box and its **"Amazon RDS (Gemini DB)"** in the architecture
diagram. It owns everything AI-assisted:

- **Itinerary generation** — a day-by-day trip plan from Google Gemini
- **Weather generation** — a per-day destination forecast from Gemini
- **/plan facade** — itinerary + weather + real Amadeus flight offers in one
  call (the itinerary page's single request)
- **Hotel search** — AI hotel suggestions for a free-text query
- **Reference data** — the countries (+ hub airport) and travel-type options
  the plan-itinerary form is rendered from

This is the port of the monolith's browser-side `GeminiService`,
`GeminiConfigBuilder`, `FlightsService`, `ItineraryPlannerFacade`, the fetch
strategies and the prompt builders (`apps/web/services/*`,
`apps/web/data/*Schema.ts`, `apps/web/app/(itinerary)/itinerary/Generate*Config.ts`).
The decisive change: **the Gemini and Amadeus API keys are server-side only
now** — the monolith shipped them to every visitor as `NEXT_PUBLIC_*` vars
(docs/TASKS.md hard constraint 7). Every generation is also audited in the
service's own database, which is what justifies a dedicated database in the
diagram.

## Request flow (the /plan facade)

```
itinerary page (web:3000)                    [rewired in T2.3]
   │  POST /api/gemini/plan { form, flightSearchCriteria? }
   ▼
gateway (:8080)  ── verifies Cognito JWT, forwards /api/gemini/* unchanged
   ▼
gemini-service (:8083)
   ├─ requireClaims()      re-verifies the token
   ├─ ItineraryPlannerFacade.planItinerary()
   │    ├─ Gemini → day-by-day itinerary   (ItinerarySchema-constrained JSON)
   │    ├─ Gemini → weather forecast       (free-form JSON)
   │    └─ Amadeus /shopping/flight-offers → FlightDisplayDetails[]
   │       (fails soft: plan is returned, flightDetails: null)
   ├─ every AI call audited → generations table (prompt, response, latency)
   ▼
200 { itineraryData, weatherData, flightDetails }
```

## Endpoints

All routes are mounted under **`/api/gemini`** and require a valid JWT
(`Authorization: Bearer <token>` or the `si_session` cookie). The gateway
forwards these paths unchanged, so what is documented here is the public path.

| Method | Path | Purpose | Body → Response |
|---|---|---|---|
| POST | `/api/gemini/generate-itinerary` | Day-by-day itinerary only | `{ form: PlanForm }` → `{ text }` (raw JSON string; `null` if Gemini failed) |
| POST | `/api/gemini/generate-weather` | Per-day forecast only | `{ form: PlanForm }` → `{ text }` |
| POST | `/api/gemini/plan` | Full facade: itinerary + weather + flights | `{ form, flightSearchCriteria? }` → `{ itineraryData, weatherData, flightDetails }` (each part independently nullable) |
| POST | `/api/gemini/hotels/search` | AI hotel suggestions | `{ query }` → `{ hotels: Hotel[] }` |
| POST | `/api/gemini/flights/search` | Amadeus flight offers | `{ criteria }` → `{ flights: FlightDisplayDetails[] }` |
| GET | `/api/gemini/reference/countries` | Countries with hub airport (form dropdowns + flight criteria) | → `{ items: Country[] }` |
| GET | `/api/gemini/reference/travel-types` | Travel-type options (solo / couple / …) | → `{ items: TravelType[] }` |

Status codes: 400 invalid body (zod), 401 missing/invalid JWT, 404 unknown
route, **503 when the matching third-party key is not configured** (the
service still boots — see below), 502 when the upstream (Amadeus) or the
database fails. AI failures inside `/plan` never fail the whole request.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SERVICE_NAME` | `gemini-service` | Name in logs and `/healthz` |
| `PORT` | `8083` | HTTP port |
| `DATABASE_URL` | — | Postgres of this service (`gemini-db`/`smart_gemini` in compose) |
| `GEMINI_API_KEY` | — | Google Gemini key. **Server-side only.** Without it the service boots, but AI endpoints answer 503 |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model id (override when Google deprecates the default) |
| `AMADEUS_API_KEY` | — | Amadeus key. Without it flight endpoints answer 503 and `/plan` omits flights |
| `AMADEUS_FLIGHTS_API_BASE_URL` | `https://test.api.amadeus.com/v2` | Amadeus host (test vs production) |
| `AMQP_URL` | — | RabbitMQ (compose convention; no events published yet) |
| `TOKEN_VERIFY_MODE` | `dev` | `dev` = locally-signed mock tokens, `cognito` = real Cognito JWKS |
| `JWT_DEV_SECRET` | `dev-only-secret` | dev-mode signing secret |
| `COGNITO_ISSUER` / `COGNITO_CLIENT_ID` | — | required only in `cognito` mode |
| `LOG_LEVEL` | `info` | pino log level |

See `.env.example` for a copy-pasteable set. For compose, put `GEMINI_API_KEY`
/ `AMADEUS_API_KEY` in the **root `.env`** (compose auto-loads it) — never
commit them.

## Diagram mapping

| Diagram box | Where here |
|---|---|
| Gemini Service (Hotel Service) | this Express app (`src/`) |
| Amazon RDS (Gemini DB) | `src/repositories/auditRepository.ts` + reference strategies (`src/reference/fetchStrategies.ts`); DDL + seed in `db/init/gemini-service.sql` |
| Google Gemini (AI generation) | `src/gemini/` — SDK wrapper, config builder, prompt builders, response schemas |
| Amadeus (flight search) | `src/flights/FlightsService.ts` |
| Message Broker (RabbitMQ) | none yet — the service publishes no events |

## Database

`db/init/gemini-service.sql` creates:

- `generations` — one row per AI call: kind (`itinerary` / `weather` /
  `hotel-suggestion`), model, prompt, response, duration. Written
  best-effort: an audit failure never fails a generation.
- `hotel_searches` — one row per hotel search: query + result count.
- `country` / `airport` / `travel_type` — reference data (moved from the
  monolith's central Supabase; the seed keeps exactly one hub airport per
  country, the shape the plan-itinerary form expects).

## Run

```bash
# whole stack (recommended — provides gemini-db; add keys to root .env):
GEMINI_API_KEY=... AMADEUS_API_KEY=... docker compose up -d --build gemini-service

# or bare against the compose infrastructure:
cp services/gemini-service/.env.example services/gemini-service/.env
# (fill in GEMINI_API_KEY / AMADEUS_API_KEY, set DATABASE_URL host to localhost:5435)
npm run dev --workspace @smart/gemini-service     # tsx watch on :8083
curl http://localhost:8083/healthz
```

Without any API keys the service is still useful offline: `/healthz` and the
reference endpoints work, and AI/flight endpoints answer a self-explanatory
503 — nothing crashes.
