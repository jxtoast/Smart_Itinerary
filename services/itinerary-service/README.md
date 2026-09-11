# itinerary-service (port 8082)

The Itinerary Service owns everything about a **saved trip**: the itinerary row
plus its demographics, accommodation, days and activities, and it publishes the
`itinerary.created` event to RabbitMQ after every successful save so the
email-service can send the trip confirmation and schedule the reminder.

This is the port of the monolith's `apps/web/services/ItineraryService.ts`
(a supabase-js client) to an Express service with hand-written SQL against its
own database — the **"Itinerary Service"** box and its **"Amazon RDS (Itinerary
DB)"** in the architecture diagram. Locally the database is the `itinerary-db`
Postgres container (DDL + demo seed: `db/init/itinerary-service.sql`); on AWS
the same `DATABASE_URL` would point at an RDS instance.

## Request flow (save)

```
ItineraryTimeline.tsx (web:3000)
   │  POST /api/itineraries  { userId, itinerary, weatherForecast }
   ▼
gateway (:8080)  ── verifies Cognito JWT, forwards /api/itineraries/*
   ▼
itinerary-service (:8082)
   ├─ requireClaims()   re-verifies the token (direct mobile/third-party calls)
   ├─ parseBody()       zod: CreateItineraryRequestSchema
   ├─ withTransaction() itinerary → demographics + accommodation
   │                    → days → activities   (all-or-nothing)
   ├─ publishItineraryCreated()  → RabbitMQ exchange si.events, key
   │                             itinerary.created  (broker down ≠ failed save)
   ▼
201 { "itineraryId": "<uuid>" }
```

## Endpoints

All routes are mounted under **`/api/itineraries`** and require a valid JWT
(`Authorization: Bearer <token>` or the `si_session` cookie; `TOKEN_VERIFY_MODE`
switches between dev mock tokens and real Cognito).

| Method | Path | Purpose | Body / Response |
|---|---|---|---|
| POST | `/api/itineraries` | Save a new itinerary aggregate | Body `CreateItineraryRequestSchema` → 201 `CreateItineraryResponseSchema` (`{ itineraryId }`) |
| PUT | `/api/itineraries/:id` | Replace an itinerary + re-sync children (one transaction) | Body `UpdateItineraryRequestSchema` → 200 `{ itineraryId }` · 404 unknown id |
| GET | `/api/itineraries/user/:userId` | List a user's itineraries (profile page) | → `ListItinerariesResponseSchema` (`{ itineraries: [...] }`) |
| GET | `/api/itineraries/:id` | Full nested aggregate (demographics, accommodation, days → activities), snake_case DB rows mapped to the frontend's camelCase `Itinerary` shape | → `GetItineraryResponseSchema` · 404 unknown id |
| DELETE | `/api/itineraries/:id` | Delete itinerary (children cascade via FK) | → `{ message }` · 404 unknown id |
| DELETE | `/api/itineraries/accommodation/:accommodationId` | Remove one hotel from an itinerary | → `{ message }` · 404 unknown id |

Validation failures (bad body / bad uuid) return 400 via the shared zod
helpers; missing tokens return 401; unexpected failures return 500 and are
logged with context. Note the historical misspelling **`itinerary_accomodation`**
is kept as the table name — it matches the DDL in `db/init/itinerary-service.sql`.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SERVICE_NAME` | `itinerary-service` | Name in logs and `/healthz` |
| `PORT` | `8082` | HTTP port |
| `DATABASE_URL` | — | Postgres of this service (`itinerary-db`/`smart_itinerary` in compose) |
| `AMQP_URL` | — | RabbitMQ; `itinerary.created` is published here (best-effort) |
| `TOKEN_VERIFY_MODE` | `dev` | `dev` = locally-signed mock tokens, `cognito` = real Cognito JWKS |
| `JWT_DEV_SECRET` | `dev-only-secret` | dev-mode signing secret |
| `COGNITO_ISSUER` / `COGNITO_CLIENT_ID` | — | required only in `cognito` mode |
| `LOG_LEVEL` | `info` | pino log level |

See `.env.example` for a copy-pasteable set.

## Diagram mapping

| Diagram box | Where here |
|---|---|
| Itinerary Service | this Express app (`src/`) |
| Amazon RDS (Itinerary DB) | `src/repositories/itineraryRepository.ts` + `db/init/itinerary-service.sql` |
| Message Broker (RabbitMQ) | `src/itineraryCreatedPublisher.ts` via `@smart/shared`'s broker adapter (`si.events` exchange) |
| Amazon Cognito | JWT verified by `@smart/shared`'s `requireClaims` |

## Run

```bash
# whole stack (recommended — provides itinerary-db + rabbitmq):
docker compose up -d --build itinerary-service

# or bare against the compose infrastructure:
cp services/itinerary-service/.env.example services/itinerary-service/.env
npm run dev --workspace @smart/itinerary-service   # tsx watch on :8082
curl http://localhost:8082/healthz
```
