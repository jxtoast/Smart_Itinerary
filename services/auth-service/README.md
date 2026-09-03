# auth-service

The **Authentication Service (User Profile)** from the architecture diagram,
listening on **port 8081**. It owns the platform's user profile data — the
`users` and `users_demographics` tables in its own Postgres database — and is
the SQL port of the monolith's `apps/web/services/UserService.ts`.

Authentication itself is **Amazon Cognito** (see the diagram's Cognito box):
clients present a Cognito JWT (or a locally-signed dev token in mock mode).
This service verifies the token but never issues one — login, signup and the
session cookie belong to the gateway (`services/gateway`, port 8080) and the
Cognito setup that lands with task T2.2.

## Layout (request path, top-down)

```
src/
  index.ts               composition root: DATABASE_URL → pg pool → repos → app
  app.ts                 express wiring: logging → JSON body → /healthz → routers → errors
  deps.ts                the dependency bag handed to every router
  http/
    async-handler.ts     express-typed bridge to @smart/shared's asyncHandler
    request-logger.ts    one structured pino line per completed request
  routes/
    me.routes.ts           GET   /api/auth/me
    profile.routes.ts      GET   /api/auth/profile        PATCH /api/auth/profile
    demographics.routes.ts GET   /api/auth/demographics   PUT   /api/auth/demographics
  repositories/
    users.repository.ts                  owns `users`
    users-demographics.repository.ts     owns `users_demographics`
```

DDL for both tables lives in `db/init/auth-service.sql`; zod request/response
contracts come from `@smart/shared` (`src/dto/auth.ts`).

## Flow of a representative request

```
Web (AuthContext)                Gateway :8080                 auth-service :8081
─────────────────                ─────────────                 ──────────────────
GET /api/auth/me  ─────────────▶ verify JWT, rate-limit  ────▶ requireClaims() re-verifies
(si_session cookie or            proxy /api/auth/* verbatim     │
 Authorization: Bearer)                                         ▼
                                                          upsert users row from
                                                          sub/email/name claims (SQL)
                                                                 │
                                                                 ▼
                                                          read users_demographics (SQL)
                                                                 │
profile + demographics  ◀──────── JSON { user: {...} }  ◀──────── MeResponseSchema.parse()
```

## Endpoints

| Method | Path                   | Auth  | Body (zod DTO)               | Response                                        |
|--------|------------------------|-------|------------------------------|-------------------------------------------------|
| GET    | `/healthz`             | none  | —                            | `{ status: "ok", service }` (compose healthcheck) |
| GET    | `/api/auth/me`         | token | —                            | `{ user: { id, name, email, avatar_url, userDemographics } }` — upserts the profile from token claims first |
| GET    | `/api/auth/profile`    | token | —                            | `{ id, name, email, avatar_url }`               |
| PATCH  | `/api/auth/profile`    | token | `UpdateProfileSchema`        | updated profile (omitted fields keep values)    |
| GET    | `/api/auth/demographics` | token | —                          | `{ userId, minBudget, maxBudget, travelType, purpose, numberOfPeople? }` — DDL defaults when nothing saved yet |
| PUT    | `/api/auth/demographics` | token | `UserDemographicsSchema`   | saved preferences (full replace, PUT semantics) |

Errors are JSON: `{ error, details? }`. Invalid bodies → 400 (zod details),
missing/invalid token → 401, unknown sub → 404 with a recovery hint.

## Environment variables

Names match `packages/shared/.env.example` (see this service's
[`.env.example`](.env.example)):

| Var                | Meaning                                                        | Default in dev                |
|--------------------|----------------------------------------------------------------|-------------------------------|
| `SERVICE_NAME`     | name used in logs and `/healthz`                                | `auth-service`                |
| `PORT`             | listen port (diagram assignment)                                | `8081`                        |
| `DATABASE_URL`     | this service's own database (database-per-service)              | `postgres://smart:smart@auth-db:5432/smart_auth` in compose; `localhost:5433` when run on the host |
| `TOKEN_VERIFY_MODE`| `dev` (locally-signed HS256) or `cognito` (JWKS, lands T2.2)    | `dev`                         |
| `JWT_DEV_SECRET`   | HMAC secret for dev tokens (must match the gateway's)           | `dev-only-secret`             |
| `LOG_LEVEL`        | pino level                                                      | `info`                        |

## Diagram mapping

| Diagram box                                   | This repo                                        |
|-----------------------------------------------|--------------------------------------------------|
| Authentication Service (User Profile)          | this service (Express, port 8081)                |
| Amazon RDS (Auth DB)                           | `auth-db` Postgres in docker-compose; `DATABASE_URL` swaps to RDS on AWS |
| Amazon Cognito                                 | token verification only (`TOKEN_VERIFY_MODE=cognito`); pool setup ships with T2.2 |

## Run it

```bash
# full local stack (builds this image and waits for auth-db to be healthy)
docker compose up -d auth-service

# or host-run against the compose database (auth-db published on :5433)
cp services/auth-service/.env.example services/auth-service/.env
npm run dev --workspace @smart/auth-service

# smoke test
curl http://localhost:8081/healthz
```

Tokens: with the default `TOKEN_VERIFY_MODE=dev` any HS256 token signed with
`JWT_DEV_SECRET` is accepted (the gateway's dev-token route mints these for
mock auth / Cypress).
