# Smart Itinerary — System Walkthrough

This is the narrative companion to [`ARCHITECTURE.md`](ARCHITECTURE.md): where
ARCHITECTURE.md is the reference (mapping tables, runbooks), this document
explains the system the way you'd explain it to a new teammate — what every
part is, why it exists, how it runs, and how the parts talk to each other.
No prior knowledge of the repository is assumed.

Companion documents:

- [`GETTING_STARTED.md`](GETTING_STARTED.md) — run the stack in 5 minutes.
- [`LOCAL-VS-AWS.md`](LOCAL-VS-AWS.md) — every local piece and its AWS twin.
- [`TASKS.md`](TASKS.md) — the task-by-task build history (all tasks done).

---

## 1. The system at a glance

Smart Itinerary is an AI-assisted trip planner: you describe a trip, Gemini
generates a day-by-day itinerary with weather and flight options, you search
and add hotels, save the trip, share it with a group, export it as a PDF, and
receive confirmation and reminder emails.

The backend is **seven cooperating processes**. Six are containers started by
`docker compose up -d`; the seventh (the web frontend) is a Node process you
run on the host with `npm run dev:web`.

| Process | Port | One-line role | State it owns |
|---|---|---|---|
| **web** (host Node process) | 3000 | Next.js UI; proxies all `/api/*` calls to the gateway | none |
| **gateway** | 8080 | single API entry point: JWT check, rate limit, routing, health aggregation | none |
| **auth-service** | 8081 | user profile + travel demographics | `auth-db` (Postgres) |
| **itinerary-service** | 8082 | save/load/update/delete itineraries | `itinerary-db` (Postgres) |
| **gemini-service** | 8083 | AI generation, hotels, flights, reference data | `gemini-db` (Postgres) |
| **tools-service** | 8084 | groups, invites, share links, PDF export | `tools-db` (Postgres) |
| **email-service** | 8085 | sends every email the platform produces | none (listens to RabbitMQ) |
| **postgres ×4** | 5433–5436 | one database per service (database-per-service) | named volumes |
| **rabbitmq** | 5672 (AMQP), 15672 (management UI) | event broker between services | volume |
| **minio** (+ one-shot `minio-init`) | 9000 (S3 API), 9001 (console) | file storage for exported PDFs | volume |
| **mailpit** | 1025 (SMTP), 8025 (web UI) | catch-all SMTP server — every email lands here | volume |

The one-sentence data-flow: **the browser only ever talks to `localhost:3000`
(the web app); the web app forwards `/api/*` to the gateway; the gateway
checks who you are and forwards to the owning service; services talk to each
other only through their databases' boundaries — by HTTP for a direct fetch,
by RabbitMQ events for anything a human must be notified about.**

---

## 2. The AWS diagram, box by box

The architecture mirrors a reference AWS diagram. Every box has a concrete
artifact in this repository; the local stack substitutes $0 equivalents that
speak the same API, so "moving to AWS" is an environment-variable change.

| Diagram box | What it is here (local, $0) | What it becomes on AWS | Where the code lives |
|---|---|---|---|
| Route53 → WAF → ALB (edge) | Next.js same-origin rewrite in `apps/web/next.config.ts` (the dev-time edge: browser → `:3000/api/*` → gateway) | ALB (public entry), created by Terraform | `infra/terraform/modules/alb` |
| API Gateway **Instance 1 / Instance 2** | one `gateway` container | the same container deployed **twice** — ECS `desired_count = 2` | `services/gateway/`; `infra/terraform/modules/ecs` |
| Amazon Cognito | `TOKEN_VERIFY_MODE=cognito` code path (wired, not required locally); dev-token mode fills in | Cognito user pool + Google IdP + app client | `packages/shared/src/adapters/jwt.ts`, `apps/web/app/auth/*`, `infra/terraform/modules/cognito` (+ its `RUNBOOK.md`) |
| Authentication Service (User Profile) | `auth-service` container | ECS service + RDS database | `services/auth-service/` |
| Itinerary Service | `itinerary-service` container | ECS service + RDS database | `services/itinerary-service/` |
| Gemini Service (Hotel Service) | `gemini-service` container | ECS service + RDS database | `services/gemini-service/` |
| Tools Service (Export PDF, Sharing) | `tools-service` container | ECS service + RDS database | `services/tools-service/` |
| Message Broker — RabbitMQ | `rabbitmq` container | Amazon MQ for RabbitMQ (documented; not in the scaffold) | `docker-compose.yml`, `packages/shared/src/adapters/broker.ts` |
| Email Service | `email-service` container | the same consumer; SMTP swaps Mailpit → SES | `services/email-service/`, `packages/shared/src/adapters/mailer.ts` |
| Amazon S3 — File Storage | `minio` container (S3-compatible API) + bucket `si-files` | S3 bucket | `packages/shared/src/adapters/storage.ts`, `infra/terraform/modules/s3` |
| Amazon RDS | `postgres:16` containers ×4 | 4 × `db.t4g.micro` RDS instances | `db/init/*.sql`, `infra/terraform/modules/rds` |
| Amazon Secrets Manager | root `.env` (gitignored), per-service `.env.example` documented | Secrets Manager, injected into ECS task env | `infra/terraform/modules/secrets` |
| CodeCommit (source) | GitHub repository | GitHub (CodeCommit is closed to new customers — documented decision) | this repo |
| GitHub Actions (CI/CD) | `.github/workflows/ci.yml` (build + test, every push) and `.github/workflows/deploy-uat.yml` (ECR push + ECS rollout, dormant) | the same two workflows; deploy leg activates once infrastructure exists | `.github/workflows/` |
| Amazon ECR | — (images built by CI/compose, no registry locally) | 6 image repositories | `infra/terraform/modules/ecr`, `deploy-uat.yml` job `push-image` |
| Amazon ECS | — (docker compose plays this role) | Fargate cluster, one task definition per service | `infra/terraform/modules/ecs` |
| Amazon CloudWatch | `docker compose logs` (services already log pino JSON, CloudWatch-ready) | log groups + alarms | `infra/terraform/modules/cloudwatch` |

Two documented fidelity notes (also in ARCHITECTURE.md): the diagram's two
"API Gateway" boxes are one stateless container deployed twice, and CodeCommit
is GitHub because CodeCommit stopped accepting new customers.

---

## 3. Repository tour — every folder and file explained

```
apps/web/            the Next.js frontend (the only user-facing process)
services/gateway/    API gateway        :8080
services/auth-service/        :8081    user profile + demographics
services/itinerary-service/   :8082    itineraries
services/gemini-service/      :8083    AI / hotels / flights / reference
services/tools-service/       :8084    groups / shares / PDF export
services/email-service/       :8085    email sender (RabbitMQ consumer)
packages/shared/     contracts + infrastructure adapters shared by all services
packages/api-client/ the frontend's typed HTTP client (+ offline mock)
db/init/             the four database schemas, applied on first container start
docker-compose.yml   the whole local platform as code
infra/terraform/     the AWS version of the platform, as code (never applied)
.github/workflows/   CI (every push) + dormant deploy-to-UAT workflow
docs/                this document, ARCHITECTURE.md, TASKS.md, runbooks
```

### 3.1 `docker-compose.yml` — the platform as one file

Fifteen services in four groups, each commented with its diagram box:

- **Databases** — `auth-db`, `itinerary-db`, `gemini-db`, `tools-db`
  (`postgres:16-alpine`, host ports 5433–5436). Each mounts one file from
  `db/init/` into Postgres's init directory, so a fresh `docker compose up`
  creates *and seeds* its schema automatically. Each has a `pg_isready`
  healthcheck, and the services `depends_on` their database
  `condition: service_healthy` — a service never boots before its schema
  exists.
- **Stateful infrastructure** — `rabbitmq` (management UI on :15672),
  `minio` + `minio-init` (the one-shot job that creates the `si-files`
  bucket), `mailpit`.
- **The gateway** — no database, no broker: it is deliberately stateless.
  Its env is just its port, the JWT dev secret, and the four upstream URLs.
- **The five services** — each with its `DATABASE_URL` pointing at *its own*
  database, its `AMQP_URL`, and (tools) its S3/MinIO credentials. All keys
  are dev-only; real third-party keys (`GEMINI_API_KEY`, `AMADEUS_API_KEY`)
  come from the gitignored root `.env` and are passed only into
  gemini-service.

### 3.2 `db/init/` — four schemas, one per service

| File | Creates | Notes |
|---|---|---|
| `auth-service.sql` | `users`, `users_demographics` | plus the seed dev-user the mock flow logs in as |
| `itinerary-service.sql` | `itinerary`, `itinerary_demographics`, `itinerary_accomodation`, `itinerary_day`, `itinerary_activity` | one itinerary row + child tables for days, activities, stays |
| `gemini-service.sql` | `generations`, `hotel_searches` | AI audit/cache; plus seeded reference rows `country`, `airport`, `travel_type` |
| `tools-service.sql` | `groups`, `group_members`, `itinerary_shares`, `pdf_exports` | the sharing/export bookkeeping |

(Why four databases: §7.)

### 3.3 `packages/shared/` — the contracts package

This package is what allowed six services to be built in parallel without
breaking each other: every request/response shape, every event, and every
infrastructure adapter lives here once. Two entry points, by runtime:

| File | What it is |
|---|---|
| `src/index.ts` | **The browser-safe barrel.** Re-exports only types, zod DTOs and event schemas. Frontend code imports this freely — it can never pull Node-only modules into a browser bundle. |
| `src/server.ts` | **The server entry.** Everything the barrel has, *plus* the adapters below. Only Node processes import this. |
| `src/adapters/config.ts` | env helpers (`env`, `requireEnv`, `envInt`, `isTruthy`) so every service reads configuration identically. |
| `src/adapters/db.ts` | Postgres pools from `DATABASE_URL` + `query`/`queryOne`/`withTransaction`. Point `DATABASE_URL` at RDS and nothing else changes. |
| `src/adapters/broker.ts` | RabbitMQ: topology (`si.events` exchange, the three queues), supervised publishing (a broker outage is logged, never thrown), and `scheduleReminder` — the TTL-based reminder trick explained in §5.3. |
| `src/adapters/mailer.ts` | SMTP mailer; same code talks to Mailpit locally and SES on AWS. |
| `src/adapters/storage.ts` | S3 client + presigned-URL signing; MinIO locally, S3 on AWS (`S3_ENDPOINT` unset → real S3). |
| `src/adapters/jwt.ts` | JWT verification (Cognito JWKS *or* locally-signed dev tokens), the `si_session` cookie extraction, `requireClaims` (401/403 gate used by every service). |
| `src/adapters/http.ts` | express-typed `asyncHandler` (async errors become JSON 4xx/5xx instead of crashes), `errorHandler`, `parseBody` (zod → 400 with field details), `createLogger` (pino JSON). |
| `src/dto/*.ts` | zod schemas per API area: `auth`, `itineraries`, `gemini`, `tools` — the single source of truth for every request and response body. |
| `src/events.ts` | the event catalogue: exchange name, routing keys, queue names, and one zod schema per event (`itinerary.created`, `itinerary.shared`, `group.invited`, `email.reminder.due`). |
| `src/types/*.ts` | the domain TypeScript types (itineraries, hotels, flights, weather…), shared verbatim by frontend and services. |
| `scripts/smoke.ts` | offline contract smoke (`npm run smoke -w @smart/shared`) — DTO round-trips, dev-token sign/verify, event schema checks. Runs in CI on every push. |

### 3.4 `packages/api-client/` — the frontend's single HTTP client

| File | What it is |
|---|---|
| `src/client.ts` | the real client: one method per endpoint, cookie credentials, zod-validated responses, path prefixes mirroring the gateway route table. |
| `src/request.ts`, `src/env.ts`, `src/errors.ts` | the fetch plumbing: `ApiClientError` (status + parsed body), base-URL resolution (defaults to same-origin `/api`), encoding. |
| `src/mock/mockClient.ts`, `src/mock/mockData.ts` | a drop-in in-memory implementation of the same interface, switched on by `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` — this is how the whole UI (and Cypress) runs offline with zero services. |
| `src/types.ts`, `src/index.ts` | the exported TypeScript types and the `createApiClient` / `createMockApiClient` factory pair. |

### 3.5 `services/` — one folder per microservice

Each service folder is the same shape (deliberate convention — learn one, read
all six):

```
services/<name>/
  Dockerfile        node:20-alpine, prod deps, runs via tsx — see §4 for the pattern
  package.json      scripts (dev/typecheck/start) + express deps
  .env.example      every env var the service reads, documented
  src/
    index.ts (or app.ts)  express app assembly: middleware order, mounts, /healthz
    routes/       URL handlers — parse, authorize, delegate, respond
    repositories/ the ONLY place SQL lives (one file per table group)
    ...           service-specific files, explained in §4
```

Shared per-service middleware files: `cookies.ts` (populates `req.cookies`
so the JWT adapter can read `si_session`), `http/request-logger.ts` (one pino
line per request), `http/require-auth.ts` (turns the shared `requireClaims`
into an express dependency-injected middleware).

### 3.6 `infra/terraform/` — the AWS platform, checked in, never applied

Nine modules, one per diagram concern, all validate-only: `network` (VPC +
public subnets, no NAT gateway — a documented cost saver), `ecr` (6 image
repos), `ecs` (Fargate cluster, one task definition per service, gateway
`desired_count = 2`, Cloud Map for compose-style hostnames, **auto-scaling
on every service**), `rds` (4 × `db.t4g.micro`), `s3` (PDF bucket),
`secrets` (per-service secret sets), `alb` (public entry), `cloudwatch`
(log groups + alarms), `cognito` (user pool + Google IdP + PKCE app
client, with a `RUNBOOK.md`). The root `README.md` has the apply runbook
and the full cost table (§11).

**How to read a `.tf` file.** These are Terraform files (HCL — HashiCorp
Configuration Language). Terraform is infrastructure-as-code: instead of
clicking through the AWS console, you write text that *describes* the
infrastructure you want, and Terraform's job is to make reality match the
description. Two properties matter. First, it's **declarative** — you
state the end state ("the gateway runs between 2 and 4 copies, aiming at
60% CPU"), never the steps to get there. Second, a `.tf` file provisions
nothing until someone runs `terraform apply` against a real AWS account —
which is exactly what this repo never does (the $0 rule). Treat the whole
tree as the precise, machine-checkable answer to "what would this system
look like on AWS?".

**How auto-scaling works** — `modules/ecs/autoscaling.tf`, the diagram's
"auto-scaled" adjective as code. Under docker-compose every service runs
a fixed number of containers; on AWS someone has to own that number and
move it. This file hands the job to AWS Application Auto Scaling with two
declarations per service, working like a home thermostat:

| Resource | Job | Think of it as |
|---|---|---|
| `aws_appautoscaling_target` | clamps each service's task count to [min, max] | the dial's range |
| `aws_appautoscaling_policy` | target-tracking on average CPU: add tasks while CPU holds above 60%, remove after 5 quiet minutes | the thermostat rule |

| Service | min | max | why |
|---|---|---|---|
| gateway | 2 | 4 | min = the diagram's two API-gateway boxes; headroom to 4 |
| the 5 backend services | 1 | 3 | one task at idle (demo cost); grows to 3 under load |

A spike, minute by minute: CPU across the gateway's 2 tasks sustains past
60% → after 1 minute (scale-out cooldown) AWS adds a 3rd task, then a 4th
— the max → the ALB spreads requests across all of them, and users notice
nothing → load subsides → after 5 quiet minutes (scale-in cooldown) AWS
removes a task, stepping back down to 2. Everything is deliberately
bounded: 19 tasks worst case across all services, which is why the maxes
are small (see the README cost table before ever raising them). Two
details: `desired_count` in `main.tf` is only the *bootstrap* value — from
the first policy evaluation the count belongs to this policy — and the
mins equal the bootstrap counts, so idle behaviour is unchanged. No IAM
setup is needed: Application Auto Scaling uses an AWS-managed
service-linked role.

### 3.7 `.github/workflows/`

| File | Runs when | What it does |
|---|---|---|
| `ci.yml` | every push to `microservices-develop` / `task/**`, every PR to `main` | 5 jobs: typecheck ×9 workspaces + 2 contract smokes · web production build · **compose smoke** (builds all images, boots the entire platform on the runner, requires the gateway's aggregated health to go green) · Cypress component + e2e in mock mode · Aikido SAST |
| `deploy-uat.yml` | manual ("Run workflow") only | the deploy leg: preflight (verifies AWS actually exists, otherwise a *green* no-op naming the gap) → build & push 6 images to ECR → roll ECS services, backends first / gateway last. Dormant by design until Terraform is applied — see §9. |

---

## 4. The services, one by one

### 4.0 The shared runtime pattern (read this first — it applies to all six)

Every service is the same small machine:

- **Language/framework:** TypeScript on Express, run with `tsx` (no build
  step — the Docker image runs the TypeScript source directly, which keeps
  images simple and hot-reload possible in dev).
- **Dockerfile pattern:** `node:20-alpine`, install production workspace deps
  with layer caching, copy `packages/shared` + the service sources,
  `EXPOSE <port>`, `CMD npx tsx src/index.ts`. Identical shape in all six.
- **Middleware order:** helmet → cookie parser → JSON body parsing with raw
  body capture → request logger → the service's routers → JSON 404 → the
  shared `errorHandler` (turns any thrown `ApiError` into a JSON status with
  an `{ error, details }` body).
- **`GET /healthz`** — liveness for compose healthchecks and the gateway's
  aggregated health (§5.4).
- **Auth:** the shared `requireClaims` verifies the JWT (from the
  `Authorization: Bearer` header or the `si_session` cookie) *again* inside
  every service — the gateway's check is the bouncer at the door, each
  service also checks its own ID (§6).

### 4.1 gateway — the single entry point (`:8080`)

**What it does.** Every API call from the outside world arrives here. It
verifies who you are (JWT), refuses obviously-broken traffic (helmet,
rate limit), forwards the request **unchanged** to the service that owns that
URL area, aggregates all services' health into one endpoint, and (in mock
mode) issues dev tokens.

**Why it is its own service.** It is the diagram's "API Gateway" box, and it
gives all the classic edge concerns exactly one home: authentication happens
once at the door instead of five times in five codebases, rate limiting is
perimeter-wide, and the frontend only ever needs to know one URL. It is
stateless on purpose — no database, no queue — which is what makes "deploy
two of them" (the diagram's Instance 1 / Instance 2) trivial.

**How it runs.** `services/gateway/src/index.ts` assembles the app in a
fixed order (the order *is* the security model):

1. `helmet` → security headers (API-only, so CSP is inert).
2. `cookieParser` → so the JWT adapter can read `si_session`.
3. `captureRawBody` → JSON parsing plus the raw bytes, so proxied bodies are
   forwarded byte-for-byte.
4. rate limit (`express-rate-limit`, window/ceiling from env).
5. the JWT gate on `/api/*` (401 JSON on a missing/bad token).
6. `POST /api/auth/dev-token` — served by the gateway itself, mock mode only.
7. the four route-table proxies, then a JSON 404 for unknown `/api/*` paths.
8. `errorHandler` — JSON 500s, never HTML stack traces.

| File | What it does |
|---|---|
| `src/upstreams.ts` | **the route table** — the four `/api/<area>` prefixes and which service owns each (URLs from env). An unset URL is not a crash: the area reports "down". |
| `src/proxy.ts` | the transparent reverse proxy (one upstream per route-table entry). Forwards method/path/query/body/headers unchanged, 120 s timeout → clean JSON 504, unreachable upstream → 502. Never leaves the browser holding a dead socket. |
| `src/health.ts` | `GET /healthz` — probes every upstream in parallel and returns `ok` only when all configured upstreams answer; this is the signal CI waits for. |
| `src/dev-token.ts` | mock-mode token issuer: signs a dev JWT for the seeded user (or a sub you name), so offline development and Cypress have a real login. |

**Endpoints:** `GET /healthz` (aggregated), `POST /api/auth/dev-token`
(mock only), and transparent proxying of
`/api/auth/*`, `/api/itineraries/*`, `/api/gemini/*`, `/api/tools/*`.

### 4.2 auth-service — who you are (`:8081`)

**What it does.** Owns the user profile and travel demographics: the
"who am I" endpoint the whole frontend hydrates from, the editable profile,
and the demographics (travel style, party size, budget level…) that prefill
the AI planning form.

**Why it is its own service.** Identity data has the strictest ownership and
privacy boundary in any system, and it changes for reasons that have nothing
to do with trips (profile edits, Cognito claim refreshes). Isolating it means
the trip pipeline can be rebuilt, scaled or redeployed without ever touching
user data, and the users database has exactly one writer in the world.

**How it runs.** Same pattern as §4.0; routers mounted under `/api/auth`,
which is why the gateway forwards `/api/auth/*` here unchanged.

| File | What it does |
|---|---|
| `src/index.ts` | app assembly; creates the DB pool and token verifier, wires them into the routes (dependency injection — routes never touch env directly). |
| `src/app.ts` | the router: mounts `me`, `profile`, `demographics` under `/api/auth`. |
| `src/routes/me.routes.ts` | `GET /api/auth/me` — upserts the user row from the token's claims (a Cognito login and a dev token both produce the same row) and returns the profile. The frontend's first call after every load. |
| `src/routes/profile.routes.ts` | `GET` / `PATCH /api/auth/profile` — read and edit name etc. |
| `src/routes/demographics.routes.ts` | `GET` / `PUT /api/auth/demographics` — the planning-prefill form data. |
| `src/repositories/users.repository.ts` | SQL for `users` (upsert-from-claims, read, update). |
| `src/repositories/users-demographics.repository.ts` | SQL for `users_demographics` (read, upsert). |
| `src/deps.ts` | the dependency bag (pool, verifier) handed to routes. |

**Data owned:** `auth-db` → `users`, `users_demographics`.
**Events:** none.

### 4.3 itinerary-service — the trips (`:8082`)

**What it does.** The CRUD backbone for saved itineraries: create, read one,
list a user's, update (including replacing days/activities/stays), delete,
and remove a single accommodation from a day.

**Why it is its own service.** Itineraries are the platform's core aggregate
— a deeply nested document (days → activities, stays) stored across five
tables. Giving this aggregate one owner means one service understands its
shape, its integrity rules and its lifecycle; nobody else writes to it
(tools-service *reads* it over HTTP, §5.2 #6). It is also the service whose
write triggers the platform's first event, `itinerary.created`.

**How it runs.** Routers mounted under `/api/itineraries`.

| File | What it does |
|---|---|
| `src/index.ts` | app assembly; mounts the itinerary router under `/api/itineraries`. |
| `src/routes/itineraryRoutes.ts` | the endpoints (table below); validates every body with the shared zod schemas. |
| `src/repositories/itineraryRepository.ts` | all SQL: the aggregate read (itinerary + demographics + stays + days + activities reassembled into one JSON document), writes wrapped in transactions so a save is all-or-nothing. |
| `src/itineraryCreatedPublisher.ts` | fires `itinerary.created` **after** a successful save (never before commit — consumers must not see an itinerary that doesn't exist). Fail-soft: RabbitMQ down is logged, the save still succeeds (§5.3). |

**Endpoints** (all under `/api/itineraries`, all authenticated):

| Method + path | Does |
|---|---|
| `POST /` | create from a plan payload |
| `GET /user/:userId` | list a user's itineraries (summary view) |
| `GET /:id` | the full aggregate (days, activities, stays, weather) |
| `PUT /:id` | replace/update (days and activities re-written transactionally) |
| `DELETE /:id` | delete the whole itinerary |
| `DELETE /accommodation/:accommodationId` | remove one hotel stay from a day |

**Data owned:** `itinerary-db` → `itinerary`, `itinerary_demographics`,
`itinerary_accomodation`, `itinerary_day`, `itinerary_activity`.
**Events published:** `itinerary.created`.

### 4.4 gemini-service — the AI brain (`:8083`)

**What it does.** Everything third-party and slow: Gemini itinerary/weather
generation, hotel search (Gemini), flight search (Amadeus), and the seeded
reference data (countries, airports, travel types) the planning form uses.
Every generation is audited into its own database.

**Why it is its own service.** Three reasons that all point the same way.
*Failure isolation:* the Gemini/Amadeus SDKs are the only external,
network-dependent, flaky-by-nature dependencies — when Google rate-limits or
Amadeus times out, only this service degrades (it answers honest 503s and the
rest of the platform doesn't notice). *Scaling profile:* AI calls take
25–50 s; a service that slow must never share a process (or a connection
pool) with snappy CRUD like login or save. *Secrets:* the `GEMINI_API_KEY`
and `AMADEUS_API_KEY` live in exactly one container's env — the browser never
sees a third-party key (in the old architecture they were public browser
constants; moving them server-side into one service was a headline security
win).

**How it runs.** Routers mounted under `/api/gemini`. Boots *without* API
keys: missing keys mean the AI/flight endpoints answer honest 503s while
`/healthz` and reference data keep working — that property is why CI's
compose smoke can run with no keys at all.

| File | What it does |
|---|---|
| `src/index.ts` | app assembly; constructs the Gemini and Amadeus clients only if their keys exist. |
| `src/config.ts` | service-level config (model names, key env names, base URLs). |
| `src/routes/geminiRoutes.ts` | the endpoints (table below); each one validates input, requires auth, and returns zod-validated responses. |
| `src/plan/ItineraryPlannerFacade.ts` | orchestrates one full plan: itinerary → weather → flights, sequenced (free-tier rate limits make parallel calls self-defeating). |
| `src/gemini/GeminiService.ts` | the raw Gemini conversation client (prompt in, JSON out). |
| `src/gemini/GeminiConfigBuilder.ts` | builds the Gemini request config (schema-constrained output). |
| `src/gemini/prompts.ts` | the prompt templates for itinerary/hotel/weather generation. |
| `src/gemini/ItinerarySchema.ts`, `src/gemini/HotelSchema.ts` | the JSON shapes the model is forced to return. |
| `src/flights/FlightsService.ts` | Amadeus flight-offer search + display shaping. |
| `src/reference/fetchStrategies.ts` | the strategy-family that serves `/reference/*` from the seeded tables. |
| `src/repositories/auditRepository.ts` | writes `generations` and `hotel_searches` audit rows (what was asked, what came back). |

**Endpoints** (under `/api/gemini`, all authenticated):

| Method + path | Does |
|---|---|
| `POST /plan` | **the main flow** — full plan: itinerary + weather + flights in one call |
| `POST /generate-itinerary` | itinerary only |
| `POST /generate-weather` | weather only |
| `POST /hotels/search` | hotel search |
| `POST /flights/search` | flight search (Amadeus) |
| `GET /reference/countries` | seeded country list (planning form) |
| `GET /reference/travel-types` | seeded travel-type list |

**Data owned:** `gemini-db` → `generations`, `hotel_searches` (audit) +
seeded `country`, `airport`, `travel_type`.
**Events:** none.

### 4.5 tools-service — groups, sharing, PDFs (`:8084`)

**What it does.** The collaboration toolkit: create groups, invite members by
email token, join by token, share an itinerary to a group or to direct
emails (producing a read-only share link), and export an itinerary as a PDF
stored in MinIO behind a presigned URL.

**Why it is its own service.** It is the only service that *combines* other
services' data with its own (it fetches itinerary aggregates over HTTP and
wraps them in shares/exports), and it owns the only binary-artifact pipeline
(pdfkit → S3 → presigned URLs). Both concerns — cross-service reads and file
production — are slow and failure-prone in ways CRUD isn't, and isolating
them keeps the core trip flow unaffected when PDF work piles up. It is also
the platform's biggest event producer (`itinerary.shared`, `group.invited`).

**How it runs.** Routers mounted under `/api/tools`.

| File | What it does |
|---|---|
| `src/index.ts` | app assembly; builds the dependency bag (pool, verifier, storage, itinerary client, publisher). |
| `src/app.ts` | mounts `groups`, `shares`, `export` routers under `/api/tools`. |
| `src/routes/groups.routes.ts` | group CRUD + invite + join (table below). |
| `src/routes/shares.routes.ts` | create a share (record + event + token) and resolve a share token to the read-only aggregate. Deliberately does *not* check the itinerary still exists at share time — the 404 surfaces at view time, so sharing never depends on another service being up. |
| `src/routes/export.routes.ts` | `GET /itinerary/:id/pdf` — fetch aggregate → render → upload → presigned URL. |
| `src/itineraryClient.ts` | the internal HTTP client to itinerary-service (the one direct service-to-service call, §5.2 #6). Forwards the caller's own auth headers, 10 s fail-fast timeout, honest 502 on unreachability. |
| `src/pdf/renderItineraryPdf.ts` | pdfkit rendering: the itinerary document → a real PDF, no headless browser. |
| `src/eventPublisher.ts` | fail-soft publishing of `itinerary.shared` + `group.invited` (same supervised-connection approach as itinerary-service's publisher). |
| `src/repositories/toolsRepository.ts` | SQL for `groups`, `group_members`, `itinerary_shares`, `pdf_exports`. |
| `src/tokens.ts` | single-use invite-token and share-token generation. |
| `src/http/require-auth.ts`, `src/http/params.ts` | auth middleware + path-parameter validation helpers. |
| `src/deps.ts` | the dependency bag type (pool, verifier, storage, client, publisher). |
| `scripts/render-fixture-pdf.ts` | renders a sample PDF offline (used by the smoke/demo tooling). |

**Endpoints** (under `/api/tools`, all authenticated except noted):

| Method + path | Does |
|---|---|
| `POST /groups` | create a group (caller becomes owner) |
| `GET /groups` | my groups + members (invited members carry their join token for demos) |
| `POST /groups/join` | join by invite token |
| `GET /groups/:id` | one group + members |
| `POST /groups/:id/invites` | invite an email → single-use token + `group.invited` event |
| `DELETE /groups/:id` | delete (owner only) |
| `POST /shares` | share an itinerary to a group and/or direct emails → share token, link, `itinerary.shared` event |
| `GET /shares/:token` | resolve a share link → read-only aggregate (requires a signed-in session) |
| `GET /export/itinerary/:id/pdf` | PDF export → presigned MinIO/S3 download URL |

**Data owned:** `tools-db` → `groups`, `group_members`, `itinerary_shares`,
`pdf_exports`.
**Events published:** `itinerary.shared`, `group.invited`.

### 4.6 email-service — the notifier (`:8085`)

**What it does.** Listens to the broker and sends every email the platform
produces: trip confirmations, share notifications, group invites, and the
"trip starts tomorrow" reminders. It has **no database and no REST API** —
its HTTP server exists only so `/healthz` can answer.

**Why it is its own service.** It is the diagram's Email Service box, and
it demonstrates the strongest microservice pattern in the repo: complete
decoupling through the broker. The services that *cause* emails (save, share,
invite) never know an email service exists — they publish events and move on.
Email being down, slow, or rate-limited affects nothing else, and adding a new
email type means touching only this service.

**How it runs.** Starts, declares the topology (via the shared broker
adapter), and consumes. Sends via SMTP — Mailpit locally, SES on AWS, same
code.

| File | What it does |
|---|---|
| `src/index.ts` | boot: connect broker, start consumers, start the healthz-only HTTP server (health reflects broker connectivity). |
| `src/consumers.ts` | queue bindings: `email.events` ← the three notification events; `reminders.due` ← the dead-lettered reminders (§5.3). |
| `src/handlers.ts` | routing-key → handler map; validates each event with the shared schema, then renders and sends. After a confirmation it schedules the reminder (§5.3). |
| `src/templates.ts` | the four HTML email templates (confirmation, share, invite, reminder). |
| `scripts/publish-test-event.ts` | publishes a sample event for manual testing without the whole flow. |

**Data owned:** none. **Queue consumption:** `email.events`,
`reminders.due`. **Sends via:** SMTP (Mailpit → `localhost:8025` UI locally).

---

## 5. How everything communicates — the complete map

### 5.1 The four communication rules

1. **The browser talks to exactly one server: the web app (:3000).** Every
   fetch the UI makes goes to same-origin `/api/*`; Next.js's rewrite
   (`apps/web/next.config.ts`) forwards it to the gateway. The browser never
   learns the gateway's address, never talks to a service directly, and
   therefore never needs CORS — and the session cookie stays first-party.
2. **The gateway is the only public API door, and it forwards
   transparently.** Whatever path the client used (`/api/itineraries/…`) is
   the path the service receives — services own their URL namespaces. The
   gateway checks the JWT first (§6), then relays.
3. **Service-to-service requests are direct, internal, and rare.** Exactly
   one exists (tools → itinerary, matrix #6). There are no
   service-to-service credentials: the caller forwards the *end user's* auth
   headers, so the receiving service authenticates the same human.
4. **Anything that must notify a human travels as an event on RabbitMQ** —
   never as a synchronous HTTP call. Publishers fail soft (a broker outage
   is logged; the user's action still succeeds), because an email must never
   be the reason a save fails.

### 5.2 The complete interaction matrix

Every communication path in the system:

| # | From → To | Mechanism | When / trigger | Notes |
|---|---|---|---|---|
| 1 | Browser → web (:3000) | HTTP | every page load and UI action | Next.js serves pages + static; UI fetches stay same-origin |
| 2 | web → gateway (:8080) | Next.js rewrite proxy (server-side) | every `/api/*` fetch (rule 1) | transparent; cookie forwarded; `proxyTimeout` 150 s so long AI calls ride on the gateway's terms |
| 3 | gateway → auth-service (:8081) | HTTP reverse proxy | `/api/auth/*` (except dev-token) | JWT gate first; 120 s ceiling → 504; unreachable → 502 |
| 4 | gateway → itinerary-service (:8082) | HTTP reverse proxy | `/api/itineraries/*` | same semantics |
| 5 | gateway → gemini-service (:8083) | HTTP reverse proxy | `/api/gemini/*` | same semantics; this is the slow path (AI, 25–50 s) the timeout layering protects |
| 6 | gateway → tools-service (:8084) | HTTP reverse proxy | `/api/tools/*` | same semantics |
| 7 | gateway → self | HTTP (internal handler) | `POST /api/auth/dev-token` | mock-mode token minting; never proxied |
| 8 | gateway → each service `/healthz` | HTTP | health aggregation probes + compose healthchecks | `ok` only when every configured upstream answers |
| 9 | **tools-service → itinerary-service** | **direct internal HTTP** | PDF export; share-link view needs the itinerary aggregate | the one service-to-service call (rule 3); forwards caller's `Authorization`/`cookie`; 10 s fail-fast; 404 → "itinerary not found", unreachable → 502 |
| 10 | itinerary-service → RabbitMQ | publish `itinerary.created` | after a successful save (post-commit) | fail-soft: broker down = logged drop, save unaffected |
| 11 | tools-service → RabbitMQ | publish `itinerary.shared` | share to group / direct emails | fail-soft, same adapter |
| 12 | tools-service → RabbitMQ | publish `group.invited` | member invited by email | fail-soft, same adapter |
| 13 | email-service ← RabbitMQ | consume `email.events` queue | bound to #10, #11, #12 routing keys | validates each event against the shared zod schema |
| 14 | email-service → RabbitMQ | publish to `reminders.waiting` (per-message TTL) | after sending a confirmation | schedules the reminder; see §5.3 |
| 15 | RabbitMQ → email-service | dead-letter `email.reminder.due` | when a `reminders.waiting` message's TTL expires | no delayed-message plugin — TTL + dead-letter-exchange only |
| 16 | email-service → mailpit (or SES) | SMTP | every rendered email | mail lands in `localhost:8025` locally |
| 17 | tools-service → minio (or S3) | S3 API (shared storage adapter) | PDF upload after rendering; presigned GET issuance | bucket `si-files` |
| 18 | **Browser → minio (or S3) directly** | presigned URL | the actual PDF download | bypasses gateway+web by design — the URL is signed for the browser, valid 1 h |
| 19 | auth-service → `auth-db` | Postgres | every profile/me/demographics op | its database only |
| 20 | itinerary-service → `itinerary-db` | Postgres | every itinerary op | its database only |
| 21 | gemini-service → `gemini-db` | Postgres | generation/hotel audit writes; reference reads | its database only |
| 22 | tools-service → `tools-db` | Postgres | groups/shares/exports bookkeeping | its database only |
| 23 | gemini-service → Google Gemini API | outbound HTTPS | plan/generate/hotel calls | the only consumer of `GEMINI_API_KEY` |
| 24 | gemini-service → Amadeus API | outbound HTTPS | flight search | the only consumer of `AMADEUS_API_KEY` |
| 25 | every service → Cognito JWKS | outbound HTTPS (cognito mode) | JWT verification | cached keyset; dev mode verifies locally instead |
| 26 | web → gateway health (ops) | HTTP | `GET /healthz` checks by humans/CI | the single "is the platform up" signal |

What is deliberately **absent**: services never read each other's databases
(#19–22 are strictly one-owner-per-database), the browser never calls any
service or the broker directly, and no service calls the gateway (the gateway
is for traffic entering the system, not inside it).

### 5.3 Two flows, end to end

**Flow A — "Save itinerary" (sync write + async confirmation + scheduled
reminder):**

```
browser → web: POST /api/itineraries            (same-origin fetch)
web → gateway: same path                        (rewrite proxy, cookie rides along)
gateway: JWT ok → forward unchanged
itinerary-service: validate (zod) → transaction over 5 tables → commit
itinerary-service → RabbitMQ: publish itinerary.created          [fail-soft]
browser ← 201 Created (the user's answer is already done here)
RabbitMQ → email-service (email.events): validate event → render template
email-service → mailpit: SMTP send (confirmation visible at localhost:8025)
email-service → RabbitMQ: publish reminders.waiting, TTL = ms until 24 h
                            before the trip's start date
… time passes; RabbitMQ expires the message and dead-letters it as
  email.reminder.due → email-service consumes → sends the reminder email
```

The reminder needs no cron, no scheduler process, no plugin: the *message's
own TTL* is the timer, and RabbitMQ's dead-letter exchange is the alarm.

**Flow B — "Share to a group" (write + event + cross-service read at view
time):**

```
browser → web: POST /api/tools/shares {itineraryId, groupId, emails}
gateway: JWT ok → tools-service
tools-service: insert itinerary_shares row → mint share token →
               build share link ${WEB_PUBLIC_URL}/shared/<token>
tools-service → RabbitMQ: publish itinerary.shared                [fail-soft]
RabbitMQ → email-service: each recipient gets the link by email
… later, a peer opens the link:
browser → web → gateway → tools-service GET /shares/:token
tools-service → itinerary-service (direct, #9): GET the aggregate,
               forwarding the peer's own auth headers
tools-service: re-validates the aggregate against the shared zod schema →
               read-only render data → browser shows /shared/<token>
```

Note the deliberate shape: sharing does not check with itinerary-service
(share-then-discover keeps sharing independent of another service's
uptime); the cross-service read happens when someone actually *views*.

### 5.4 Health and failure semantics

- **`GET /healthz` on the gateway** probes every configured upstream in
  parallel → `{ status: "ok" | "degraded", upstreams: [...] }`. CI's compose
  smoke waits for `ok`; compose healthchecks keep containers honest.
- **Timeouts are layered smart side first:** the gateway aborts an upstream
  at 120 s with a clean JSON 504; the web proxy in front of it waits 150 s.
  The smarter layer (the gateway, which knows the service names) always gets
  to explain the failure before the dumber outer hop gives up. The browser
  never holds a dead socket.
- **Degraded ≠ down:** gemini-service without API keys answers honest 503s
  on AI endpoints while `/healthz`, reference data and every other service
  stay green.
- **Publishing is best-effort by design:** `itinerary.created`,
  `itinerary.shared`, `group.invited` are logged (not thrown) when RabbitMQ
  is down — the shared broker adapter reconnects and self-heals on the next
  publish.

---

## 6. Authentication end-to-end

Three modes, one code path. Which mode is controlled by
`TOKEN_VERIFY_MODE` (`cognito` | `dev`) — every verifier in every service
flips together.

**The session artifact** is the `si_session` httpOnly cookie (set by the web
app's server routes after a successful login). httpOnly = JavaScript cannot
read it; first-party = no CORS dance. `Authorization: Bearer` tokens are
equally accepted (the diagram's "Mobile / Third-Party clients" door).

**Real mode (Cognito):** browser → `/auth` → `web /auth/start` (generates
PKCE pair, state; httpOnly handoff cookies) → Cognito hosted UI (Google
federated) → callback with `code` → `web /auth/callback` validates state,
exchanges the code server-side (PKCE verifier), sets `si_session` with the
id_token → cleared handoff cookies. The pool itself is Terraform +
runbook (`infra/terraform/modules/cognito/RUNBOOK.md`) — wired, not required
to run locally.

**Dev mode (default, $0):** `POST /api/auth/dev-token` (gateway-served, dev
mode only) returns a locally-signed JWT for the seeded user; the web app's
`/auth/start` uses it automatically when no pool is configured, so the
no-AWS experience still has a real login, real cookies, real 401s.

**Verification happens twice, on purpose:** the gateway rejects bad tokens
at the door (one place, perimeter-wide), and *every* service re-verifies via
the shared `requireClaims` inside its routes. Services trust no network
position — in the diagram's world, another workload inside the VPC could
call a service directly, and the service would still enforce identity.

**Mock mode** (`NEXT_PUBLIC_ENABLE_MOCK_AUTH`, a build-time web flag) swaps
the api-client for the in-memory mock — zero network, zero services. This is
what Cypress runs on and what makes the UI demonstrable on a plane.

---

## 7. The data model — four databases, one owner each

**Why database-per-service.** A shared schema is the fastest way to
re-couple microservices: any service can (and eventually does) join across
tables it doesn't own, and after that no service can be deployed, scaled or
re-modeled independently. Here, each database has exactly one writer (its
service), so each schema can change with its service and nothing else. The
one place that needs *another* service's data — the share/PDF view — does
what distributed systems do: an HTTP read (#9 in the matrix), not a join.

| Database (container, host port) | Owner | Tables | What each holds |
|---|---|---|---|
| `smart_auth` (auth-db, :5433) | auth-service | `users` | one row per signed-in identity, upserted from token claims |
| | | `users_demographics` | travel style / party / budget prefill for planning |
| `smart_itinerary` (itinerary-db, :5434) | itinerary-service | `itinerary` | the root: destination, dates, owner, weather snapshot |
| | | `itinerary_demographics` | the planning inputs the trip was generated with |
| | | `itinerary_accomodation` | hotel stays per itinerary |
| | | `itinerary_day` | the day-by-day skeleton |
| | | `itinerary_activity` | activities within a day |
| `smart_gemini` (gemini-db, :5435) | gemini-service | `generations` | AI call audit (prompt/response per generation) |
| | | `hotel_searches` | hotel search audit/cache |
| | | `country`, `airport`, `travel_type` | seeded reference data for `/reference/*` and the planning form |
| `smart_tools` (tools-db, :5436) | tools-service | `groups`, `group_members` | groups + membership (with invite status/tokens) |
| | | `itinerary_shares` | share records: token, audience, sharer |
| | | `pdf_exports` | export bookkeeping: storage key, expiry |

Schemas are plain SQL in `db/init/*.sql`, mounted into each Postgres
container's init directory — a fresh volume seeds itself on first `up`.
Cross-service *reads* are by id over HTTP (§5.2 #9); there are no foreign
keys across databases, by design.

---

## 8. The frontend — `apps/web`

Next.js App Router, one process on :3000, talking exclusively through
`@smart/api-client` (same-origin `/api` → rewrite → gateway).

**Where each screen lives:**

| Route group / path | Screen | Talks to |
|---|---|---|
| `app/page.tsx`, `HomeCarousel` | landing | — |
| `app/(hotel)/hotel/*` | hotel search → results → detail, add-to-itinerary | `POST /api/gemini/hotels/search`, itinerary `GET`/`PUT` |
| `app/(itinerary)/plan-itinerary` | the planning form (demographics prefilled) | `GET /api/auth/demographics`, `GET /api/gemini/reference/*`, `POST /api/gemini/plan` |
| `app/(itinerary)/itinerary` + `ItineraryTimeline` | generate + the day-by-day timeline; save | `POST /api/gemini/plan`, `POST`/`PUT /api/itineraries` |
| `app/(itinerary)/itinerary/[userId]/[itineraryId]` | a saved itinerary view + **Export PDF** button | `GET /api/itineraries/:id`, `GET /api/tools/export/itinerary/:id/pdf` |
| `app/(tools)/groups/*` | groups: create, invite, join, members, share panel | `/api/tools/groups/*`, `POST /api/tools/shares` |
| `app/shared/[token]` | the read-only shared view | `GET /api/tools/shares/:token` |
| `app/profile/[userId]` (+ `edit-profile`) | profile + demographics editing | `GET/PATCH /api/auth/profile`, `GET/PUT /api/auth/demographics` |
| `app/auth/*` (`page`, `start`, `callback`, `signout`) | sign-in/out; server routes implementing PKCE + cookie session | Cognito hosted UI or dev-token mint |

**The load-bearing files:**

| File | What it does |
|---|---|
| `next.config.ts` | the same-origin rewrite (`/api/:path*` → gateway), the 150 s `proxyTimeout` (the AI calls are slow; the outer hop must outlast the gateway's 120 s so the smarter layer fails first), image hosts |
| `context/AuthContext.tsx` | the client-side session: hydrates from `GET /api/auth/me`, exposes login/logout, knows mock vs real mode |
| `lib/api.ts`, `lib/apiClientSession.ts` | the api-client singletons (real and mock) every page fetches through |
| `lib/apiError.ts` | one place that turns `ApiClientError` status codes into human panels |
| `hooks/useItinerary.ts`, `hooks/useHotels.ts` | data-fetching hooks over the client |
| `lib/auth/cognito.ts` | the PKCE/Cognito URL helpers used by the `app/auth/*` server routes |
| `types/*.ts` | one-line re-export shims of the shared domain types (kept so older imports resolve) |

**What is deliberately absent from the frontend:** any third-party API key
(Gemini/Amadeus live only in gemini-service's env), any direct call to a
backend service or the broker, and any Supabase/Cognito credential in
browser code.

---

## 9. CI/CD — what runs when

**`ci.yml` — the CI leg (every push, every PR).** Five jobs:

1. **checks** — `tsc --noEmit` across all 9 workspaces + both contract
   smokes (shared DTO/events/adapters, api-client wire behaviour).
2. **build-web** — the production Next build (the same one compose/CI
   deploys).
3. **compose-smoke** — *the quiet star*: builds all six service images from
   scratch, `docker compose up`s the entire platform on the runner, and
   polls the gateway's `/healthz` until every upstream reports healthy. In
   other words: **every push is deployed and health-verified once** — into
   an environment that lives for two minutes.
4. **cypress** — component suites + all 17 e2e specs in mock mode against a
   production server build.
5. **sast** — Aikido static/dependency security scanning.

**`deploy-uat.yml` — the CD leg (manual, dormant by design).** Three jobs:
`preflight` (verifies AWS credentials are set *and* the Terraform-managed
ECR repos + ECS services actually exist; if not, the run summary names the
exact gap and the run finishes **green** — a dormant pipeline, not a broken
one), `push-image` (matrix: build and push all six images to ECR, `:latest`
+ short-SHA provenance tag), `rollout` (force each ECS service to re-pull
and wait for stability — backends first, gateway last). It becomes a real
UAT pipeline the moment an AWS account exists; until then it costs nothing
and demonstrates the full GitHub → Actions → ECR → ECS path.

---

## 10. Run it + demo it (all $0)

```bash
git clone https://github.com/jxtoast/Smart_Itinerary.git   # (or your fork)
cd Smart_Itinerary
npm ci
docker compose up -d --build      # infra + gateway + 5 services
npm run dev:web                   # the frontend on http://localhost:3000
```

Optionally put real keys in the gitignored root `.env` (see
`.env.example`) — without them everything works except AI/flight search
(honest 503s). Watch the emails at `localhost:8025`, the broker at
`:15672`, MinIO at `:9001`.

**A 5-minute demo that always works (offline, mock mode):** set
`NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`, `npm run dev:web` — sign in, run the
planning form, generate a mock itinerary, save, edit profile/demographics,
create a group, invite, join, share, open the share link, export the PDF.

**The live demo (needs the free-tier Gemini key — budget it):** without the
mock flag, sign in, plan a real trip (~25–50 s over the gateway; the free
tier allows ~20 generations/day and each plan spends about two — rehearse on
mock mode, spend live clicks carefully).

Full details: [`GETTING_STARTED.md`](GETTING_STARTED.md).

---

## 11. AWS later — the same system, applied

`infra/terraform/` is the AWS rendering of everything in §1–§7, as code,
validated but **never applied** (that's what keeps the project $0). Nine
modules: `network` (VPC, public subnets, no NAT — a documented ~$33/mo
saver), `ecr`, `ecs` (Fargate; gateway `desired_count = 2`, every service
auto-scaled — see §3.6), `rds` (×4),
`s3`, `secrets`, `alb`, `cloudwatch`, `cognito` (+ runbook).

What applying changes: **nothing in the images or the code.** Services
already read every dependency from env (`DATABASE_URL` → RDS,
`S3_ENDPOINT` unset → real S3, SMTP → SES, `TOKEN_VERIFY_MODE=cognito`).
The runbook (`infra/terraform/README.md`) covers apply order, the one-time
DDL load (RDS doesn't run compose init scripts), and the cost table
(≈ $130–150/mo while up, dominated by RDS + ALB + Fargate;
`terraform destroy` returns the account to $0). The `deploy-uat.yml`
workflow is the CI/CD path that pushes images there once it exists.

---

*Built task-by-task on `microservices-develop`; the full history, with
verification evidence per task, is [`docs/TASKS.md`](TASKS.md).*



