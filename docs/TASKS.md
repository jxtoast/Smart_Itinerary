# Smart Itinerary — Microservices Re-platform: PRD & Task Tracker

> **This file is the single source of truth for the re-platform work.**
> Every agent working on any branch MUST read it before starting a task and MUST
> update it when claiming and completing a task (see [Agent Protocol](#agent-protocol)).
> Detailed background: `.context/plan-microservices-replatform.md` (workspace-local,
> gitignored — this file is the committed copy that matters).

---

## 1. Product Requirements (PRD)

### 1.1 Goal
Re-platform the Smart Itinerary Next.js monolith into the containerized microservice
architecture shown in the AWS diagram, matching the diagram closely (module
assignment — diagram fidelity is graded), while keeping the app working at every step.

### 1.2 Target architecture (from the diagram)

| Diagram box | Implementation |
|---|---|
| Clients (Web / Mobile / Third Party) | Next.js web app + any HTTP client with a Cognito JWT |
| Route 53 → WAF → ALB | Terraform scaffold (checked in, **not applied**) |
| API Gateway Instance 1 / Instance 2 | `services/gateway` (Express) — ECS desired count 2 reproduces the two instances |
| Amazon Cognito (Auth) | Cognito user pool + Google federation, JWT verified at gateway |
| Tools Service (Export PDF, Sharing) | `services/tools-service` — pdfkit → S3/MinIO, groups & share links |
| Authentication Service (User Profile) | `services/auth-service` — users, users_demographics |
| Itinerary Service | `services/itinerary-service` — itinerary + days/activities/demographics/accommodation |
| Gemini Service (Hotel Service) | `services/gemini-service` — AI generation, hotels, flights, plan facade |
| Message Broker (RabbitMQ) | RabbitMQ topic exchange `si.events` + TTL+DLX reminder queues |
| Email Service | `services/email-service` — consumes events, SMTP (Mailpit locally / SES later) |
| RDS ×4 (database-per-service) | Postgres ×4 in docker-compose; `db/init/*.sql` DDL |
| Amazon S3 (File Storage) | MinIO locally, S3 API-compatible adapter (`packages/shared/src/adapters/storage.ts`) |
| AWS Secrets Manager | Server-side env only now; Secrets Manager wiring in Terraform |
| CI/CD: CodeCommit → GitHub → Actions → ECR → ECS → CloudWatch | GitHub is the source (CodeCommit closed to new customers); Actions workflows; ECR/ECS/CloudWatch in Terraform |

### 1.3 Hard constraints
1. **$0 cost, no upfront spend.** Everything runs locally on docker-compose. AWS
   exists only as Terraform code + adapters. Never provision cloud resources.
2. **AWS-swappable.** S3/MinIO, SES/SMTP, RDS/Postgres, ECS/compose must all be
   env-var swaps. Same Docker images everywhere.
3. **Auth = Amazon Cognito** (user-confirmed decision).
4. **Emails = itinerary reminders** (+ confirmation, share and invite notifications).
5. **Tools service = PDF export + share to peers in a group.**
6. **The app must keep working after every merged task** (strangler pattern — legacy
   paths stay until the page using them is switched).
7. **Secrets never in the browser.** End state: no `NEXT_PUBLIC_` API keys in `apps/web`.
8. **First-time-reader readability is a graded requirement.** The Code Standards
   section below is a hard pre-requisite for every task — comments, clear naming,
   service READMEs — not optional polish.

### 1.4 Key decisions (do not relitigate in tasks)
- TypeScript everywhere; **Express** per service; **npm workspaces** (`@smart/*`), no nx/turbo.
- DB access via `pg` + hand-written repositories (port of supabase-js queries to SQL).
- Contracts live in `packages/shared` (zod DTOs + event schemas + adapters).
  **Services must not import from each other** — only from `@smart/shared`.
- Frontend calls stay same-origin via `next.config.ts` rewrite `/api/:path*` → gateway:8080.
- Ports: web 3000 · gateway 8080 · auth 8081 · itinerary 8082 · gemini 8083 ·
  tools 8084 · email 8085 · rabbitmq 15672 · mailpit 8025 · minio 9000/9001.

### 1.5 Target layout
```
apps/web/                     # Next.js app (moved in T0.1)
services/gateway/             # 8080
services/auth-service/        # 8081
services/itinerary-service/   # 8082
services/gemini-service/      # 8083
services/tools-service/       # 8084
services/email-service/       # 8085
packages/shared/              # types, zod DTOs, event schemas, adapters
db/init/<service>.sql         # per-service DDL + seeds
docker-compose.yml            # full local stack
infra/terraform/              # AWS scaffold — checked in, NEVER applied
docs/ARCHITECTURE.md          # diagram mirror + mapping + runbooks
```

---

## Branching model

```
main  ←  microservices-develop  ←  task/<id>-<slug> branches
```

- **`microservices-develop`** is the integration branch for the entire re-platform.
  Every task branch merges into it; it merges into `main` when the re-platform
  is complete (user's call per phase). Branched from `main` in Phase 0, so it
  carries the monolith (still working) plus all re-platform commits.
- The pre-existing team `develop` branch is **not** used by this effort — leave it
  untouched.
- Task branches: `task/<id>-<slug>`, based on the latest `microservices-develop`
  (or on a dependency task's branch when that hasn't merged yet — note it in the
  tracker Notes).
- **Parallel agents onboard automatically**: every branch cut from
  `microservices-develop` carries this file (PRD, protocol, code standards, board).
  Because several agents hold copies at once, always merge/rebase the latest
  `microservices-develop` into your branch **before claiming a task**, and edit
  **only your own task's row** — this keeps tracker merge conflicts rare and
  mechanical (adjacent rows can conflict; resolve by keeping both `done` rows).

---

## Service conventions (Phase 1 — applies to every service task)

All Phase 1 agents branch from `microservices-develop` and follow these exactly,
so parallel branches land merge-clean:

1. **Port + env**: service listens on the port from §1.4; `SERVICE_NAME` and
   `PORT` env vars; env-var NAMES exactly as in `packages/shared/.env.example`.
2. **docker-compose.yml**: append your service block at the END of the
   `services:` section using this template (build context is repo root):
   ```yaml
     <service-name>:
       build:
         context: .
         dockerfile: services/<service-name>/Dockerfile
       environment:
         SERVICE_NAME: <service-name>
         PORT: "<port>"
         DATABASE_URL: postgres://smart:smart@<db-host>:5432/<db-name>
         AMQP_URL: amqp://guest:guest@rabbitmq:5672
         LOG_LEVEL: info
       ports:
         - "<port>:<port>"
       depends_on:
         <db-host>:
           condition: service_healthy
         rabbitmq:
           condition: service_healthy
       healthcheck:
         test: ["CMD", "wget", "-qO-", "http://localhost:<port>/healthz"]
         interval: 10s
         timeout: 3s
         retries: 5
   ```
   (`<db-host>`/`<db-name>` per service: auth-db/smart_auth · itinerary-db/smart_itinerary · gemini-db/smart_gemini · tools-db/smart_tools. gateway + email-service drop the DB lines; email-service keeps AMQP only.)
3. **No changes to `packages/shared`** — if a contract is missing, extend your own
   service only if trivially local; otherwise flag it in your tracker Notes.
4. **No merging into `microservices-develop` and no starting other tasks** — push
   your `task/*` branch and stop. The lead workspace integrates branch-by-branch
   with verification between each.
5. **Offline verification honesty**: Postgres/RabbitMQ are not runnable in agent
   workspaces (no Docker). Verify locally what is real (typecheck, service boots
   via `tsx`, `/healthz`, zod 400s, SQL reviewed against `db/init/*.sql`), and
   note in your tracker row that runtime verification happens when the user runs
   `docker compose up --build`. T1.5 additionally ships
   `services/email-service/scripts/publish-test-event.ts`; T1.6 verifies PDF
   generation against a fixture itinerary payload (full E2E proven at integration).
6. **Gateway forwarding contract** (set at integration, 2026-09-04): the gateway
   forwards your public path UNCHANGED — `GET /api/gemini/plan` arrives at
   gemini-service as `GET /api/gemini/plan`. Mount your routers under your own
   public prefix (auth-service: `/api/auth/*`, itinerary-service:
   `/api/itineraries/*`) and do NOT expect prefix-stripped paths. Only
   hop-by-hop headers are dropped; `Authorization`/cookies pass through for
   your own `requireClaims` re-verification.

---

## Agent Protocol

**Every agent, every branch, no exceptions:**

1. **Before starting** — read this file, pick ONE unclaimed task whose dependencies
   are all `done`, then set its row to `in-progress` with your branch name
   (commit this tracker change on your branch).
2. **Branch naming** — `task/<id>-<slug>`, e.g. `task/t1.2-auth-service`.
   Base your branch on the latest `microservices-develop` (or the branch of a
   dependency task if that hasn't merged — note it in your PR).
3. **Scope discipline** — touch only the files your task owns. Cross-service needs
   go through `packages/shared` contracts; if a contract is missing, extend
   `packages/shared` in your branch and flag it in your PR + the tracker Notes.
4. **Code Standards** (see below) — mandatory, graded pre-requisite, not optional polish.
5. **Definition of Done** (all must hold):
   - [ ] Acceptance criteria for the task verified (actually run it — curl, tests, build)
   - [ ] `npm run typecheck` passes in all workspaces; `npm run build --workspace @smart/web` passes
   - [ ] New env vars documented in the relevant `.env.example`
   - [ ] No secrets committed; no new `NEXT_PUBLIC_` server-side secrets
   - [ ] **Code Standards check passed**: file-header comments, commented endpoints/queries,
         and a first-time reader can trace the feature end-to-end (web → gateway →
         service → DB/broker → response) just by reading the files along the path
   - [ ] **Service README created/updated** (`services/<name>/README.md`) for Phase 1/2 tasks:
         purpose, endpoints table, env vars table, how it maps to the diagram, run instructions
   - [ ] This tracker updated **in the same PR**: status → `done`, branch + PR linked,
         one-line "what actually happened" in Notes (deviations called out)
6. **If blocked or scoped-down** — do NOT silently mark `done`. Set `blocked`, write
   the blocker in Notes, and finish every other part of the task that you can.
7. **Check-in gates** — after each phase's last task merges, pause and report to the
   user before starting the next phase (user wants phase-by-phase confirmation).
8. **Working checklist (`.context/todos.md`)** — at claim time, write your task's
   subtasks into `.context/todos.md` in your workspace as `- [ ]` checkboxes
   (claim row → implement per endpoint/file → verify → README → tracker row →
   push), with a `State:` line at the top (`in-progress` / `blocked` / `done`).
   Tick items `- [x]` as you finish them and keep the file current while you
   work: it is the user's live window into your progress, and an agent going
   off the rails shows up as unticked items piling up. `.context/` is
   gitignored and workspace-local — the authoritative board stays `docs/TASKS.md`.

**Status legend:** `todo` · `in-progress` · `blocked` · `done`

---

## Code Standards (mandatory pre-requisite for every task)

**The audience is a reader seeing this codebase for the first time** — lecturers,
graders and classmates. This is a module project: if a first-time reader cannot
understand a file without asking the author, the file is not done.

1. **File-header comment** — every new file opens with a short comment (2–5 lines):
   what this file is, which diagram component it implements, and for services the
   port + env vars it reads. Example style: `packages/shared/src/adapters/broker.ts`.
2. **Why-comments, not what-comments** — explain the reasoning, constraints and
   architecture links. Don't narrate obvious code (`// increment i` is noise).
   Non-obvious logic (SQL joins, TTL/DLX flows, camelCase↔snake_case mapping,
   auth checks) always gets a comment.
3. **Self-explanatory names** — a function's name says what it returns/does
   (`saveItineraryWithDays`), variables read like the domain (`itineraryId`, not
   `x`). No single-letter names outside tiny lambdas.
4. **Small and boring beats clever** — one job per function (aim ≤ ~40 lines),
   guard clauses over deep nesting, straightforward loops over clever one-liners.
5. **No magic values** — queue names, routing keys, TTLs, ports, cookie names live
   as named constants (`packages/shared/src/events.ts`, adapters); no inline
   `"amqp://..."` or `86400000` in service code.
6. **SQL is commented** — repository files state in the header which tables they
   own and why (matching `db/init/*.sql`); non-trivial queries get a one-line
   intent comment above them.
7. **Endpoints are documented in place** — every route handler gets a short
   comment: purpose, who calls it, request/response shape. Validation uses the
   zod DTOs from `@smart/shared` — never hand-rolled inline checks.
8. **Honest errors** — error messages say what failed and where; errors are
   logged with context fields (ids, routing keys) and never swallowed silently.
9. **No dead code** — no commented-out blocks, no unused exports, no `any`
   without a justifying comment (prefer `unknown` + narrowing).
10. **Service README per service** (`services/<name>/README.md`) — purpose, a
    small mermaid/ASCII flow of a representative request, endpoints table, env
    vars table, diagram mapping, run instructions. Write it for the grader.
11. **Self-review before `done`** — re-read your own diff as a stranger; if any
    step of the feature's journey is unclear from code + comments alone, fix it
    before opening the PR.

**Status legend:** `todo` · `in-progress` · `blocked` · `done`

---

## 2. Task board

### Phase 0 — Foundation (sequential; blocks everything)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T0.1 | Monorepo scaffold: npm workspaces, app → `apps/web`, service skeletons, workflows | — | `microservices-develop` | **done** | Scaffold applied directly on the integration branch; build+typecheck green; supabase-js pinned 2.48.1 via root override |
| T0.2 | docker-compose + database-per-service DDL (`db/init/*.sql`) | T0.1 | `task/t0.2-compose-infra` | **done** | Infra only: 4× postgres (DDL reconstructed from service code + demo seeds incl. mock-auth user), rabbitmq, minio+bucket init, mailpit. YAML validated; **runtime `docker compose up` pending — Docker not available in agent workspace, run on your machine**. App containers deliberately land with their Phase 1/2 tasks |
| T0.3 | `packages/shared`: move types, zod DTOs, event schemas, adapters (db/storage/mailer/broker/jwt/http) | T0.1 | `task/t0.3-shared-contracts` | **done** | Types moved (web keeps one-line shims so legacy pages keep working); zod DTOs for auth/itineraries/gemini/tools; events + TTL/DLX reminder topology; 6 adapters; smoke test (`npm run smoke -w @smart/shared`) ALL GREEN; all workspaces typecheck + web build green. Deviation: `data/*Schema.ts` stays in web for now (imports Gemini SDK `SchemaType` — vendor-specific; moves to gemini-service in T1.4, not shared) |

**📍 Check-in 1** after Phase 0: app runs from `apps/web`, infra up, contracts published.

### Phase 1 — Services (all parallel; depend only on T0.3)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T1.1 | **gateway** 8080: route table `/api/{auth,itineraries,gemini,tools}/*`, JWT verify (jose+JWKS, cookie+Bearer), rate-limit, helmet, dev-token route (mock only), health aggregation | T0.3 | `task/t1.1-gateway` | **done** | Verified live with tsx: 4 skeletons + gateway, `/healthz` aggregation (ok + degraded cases), proxied routes with prefix stripped (upstream saw `/me`, `/reference/countries`), Bearer **and** `si_session` cookie auth, 401 on missing/bad token, 502 `<service> is down` for absent **and** unreachable upstreams (gateway stays up), 429 rate-limit, dev-token 404 under `TOKEN_VERIFY_MODE=cognito`, JSON body forwarded byte-for-byte. `npm run typecheck` all workspaces green; `@smart/web` build green (needs root `.env` sourced — pre-existing, unrelated). Deviation: `@smart/shared` `asyncHandler` types `req` as `never` and isn't assignable to an Express `RequestHandler`, so gateway ships a locally-typed `asyncRoute` copy (`src/async-route.ts`); shared untouched per conventions — worth fixing there in a later shared-touching task. Integration fix 2026-09-04: forwarding contract changed from prefix-stripped to **transparent full-path forward** (`upstreamForwardPath`) — both merged services mount routers under their public prefixes, so stripped paths 404'd at runtime (found by the user's first compose run). Proven end-to-end on a scratch Postgres: healthz aggregation, 401 gate, dev-token, `/me` upsert 200, itinerary list 200, POST 201, read-back, 404 routing — 8/8. README updated; conventions §6 added for wave-2 services. Follow-up fix (user compose run 2): dev-token's default `sub` was `"dev-user"`, which auth-service's UUID `users(id)` upsert rejects (Postgres 22P02 → 500) — the DB-backed path no agent could exercise offline. Default is now the seeded mock-auth user (`1b9472e1-…`, matching `db/init/auth-service.sql` + the shared smoke test); empty-body tokens verified 200 end-to-end on a fresh seeded cluster (6/6 incl. demographics + itinerary round-trip). |
| T1.2 | **auth-service** 8081: port `UserService` → SQL repos; `GET /me` (upsert from claims), `GET/PATCH /profile`, `GET/PUT /demographics` | T0.3 | `task/t1.2-auth-service` | **done** | Typecheck green (all 8 workspaces); boots via tsx — /healthz 200, 401 no-token, 400 zod/malformed-JSON, JSON 404 verified by curl; SQL reviewed against db/init/auth-service.sql. **DB-backed paths (claim upsert, PATCH/PUT success, FK 404) verify when the user runs `docker compose up --build` — no Docker in agent workspace.** Pre-existing note: web `next build` fails on this branch without `apps/web/.env.local` (legacy Supabase prerender env) — passes with placeholder env vars, unrelated to this task. Integrated: merged clean after compose/tracker conflict resolution; typecheck + web build + shared smoke green on the merged tree. Follow-up fix (user compose run 3): `upsertFromClaims` coalesced an absent name claim to the literal string `'null'` in the VALUES clause, which made `EXCLUDED.name` never-NULL so the conflict branch clobbered stored names (seeded "Test User" → `'null'` on first `/me`). Fixed: VALUES side falls back to `'New User'` for fresh claimless users; DO UPDATE side binds $2/$3 raw so absent claims preserve. Verified on a fresh seeded cluster through the gateway: seeded name preserved, fresh-with-claim, claimless-keeps-stored, PATCH persists name+avatar. **Decision point for T2.2/T2.4:** `/me` intentionally refreshes name/email from token claims on every call (me.routes.ts: "Cognito is source of truth"), so PATCH-ed names revert on the next `/me` while avatar_url persists — profile UX semantics need a call when the real Cognito flow lands. |
| T1.3 | **itinerary-service** 8082: port `ItineraryService` (save/update/get/delete incl. days/activities) → SQL repos; publish `itinerary.created` | T0.3 | `task/t1.3-itinerary-service` | **done** | 6 routes under `/api/itineraries`, all requireClaims-gated + zod-validated; save/update cascades run in `withTransaction`; `itinerary.created` published best-effort (broker down → logged, save unaffected; broker-up delivery proven at integration). Verified against a scratch native Postgres 14 loaded with `db/init/itinerary-service.sql`: 201/200/400/401/404s, nested camelCase aggregate, replace-on-update, FK-cascade delete (0 orphans), invalid-date rollback, compose YAML valid, all workspaces typecheck + web build green. Deviations: (1) +1 `setval` in `db/init/itinerary-service.sql` — seeded explicit `itinerary_day` ids never advanced the sequence, so the first insert collided (T0.2 file, flagged); (2) PUT replaces children instead of the monolith's row-by-row update, which silently dropped newly added activities/accommodations; (3) list endpoint keeps snake_case rows per the shared `ListItinerariesResponseSchema`, dates normalized to `YYYY-MM-DD`. Integrated: merged after compose/tracker conflict resolution; compose YAML re-validated (11 services incl. gateway+auth+itinerary), typecheck + web build + shared smoke green on the merged tree. |
| T1.4 | **gemini-service** 8083: move `GeminiService`, `GeminiConfigBuilder`, hotel/flight search, fetch strategies, `ItineraryPlannerFacade`; endpoints `/generate-itinerary`, `/generate-weather`, `/plan`, `/hotels/search`, `/flights/search`, `/reference/*`; keys server-side only; audit rows in own DB | T0.3 | `task/t1.4-gemini-service` | **done** | Ported GeminiService/ConfigBuilder, prompt builders + moved `data/*Schema.ts` (per T0.3), FlightsService, fetch strategies + facade; 7 routes under `/api/gemini`, all requireClaims + zod; every AI call audited into `generations`/`hotel_searches`. Verified live: boots via tsx (healthz, 401 missing+bad token, cookie auth, 400 zod/malformed-JSON, JSON 404, per-endpoint 503s when keys absent); reference endpoints + audit rows proven against a scratch native Postgres 14 loaded with `db/init/gemini-service.sql`; LIVE Gemini generation through the service — `/plan` facade returned a real 5-day itinerary + weather (flightDetails null via the designed degradation path), `/hotels/search` returned schema-constrained real hotels, `/generate-itinerary`/`-weather` verified; all typechecks + `@smart/web` build (root `.env` sourced) + shared smoke green; compose YAML validated (gemini block appended last). Offline-blocked, honest notes: Amadeus is unreachable from this sandbox (connection blocked) — the 502 and facade-null degradation paths are proven but a live flight search needs the user's machine, and the monolith's bearer-key auth style is kept as-is (upgrade to Amadeus OAuth2 client-credentials later if the key stops working); `docker compose up` still to be run by the user (no Docker here). Deviations: (1) keys moved to server-side env `GEMINI_API_KEY` / `AMADEUS_API_KEY` / `AMADEUS_FLIGHTS_API_BASE_URL` (+ optional `GEMINI_MODEL`); a missing key no longer throws at boot (monolith behavior) — the service boots and the affected endpoints answer self-explanatory 503s. (2) model default `gemini-2.0-flash` → `gemini-3.6-flash`: Google retired 2.0-flash (confirmed by a live 404 during verification); override via `GEMINI_MODEL`. (3) `db/init/gemini-service.sql` extended with `country`/`airport`/`travel_type` + seed + setval — the reference data moved out of the monolith's central Supabase into this service's own DB (T0.2 file, flagged per conventions). (4) malformed/truncated Gemini JSON now logs and yields null instead of crashing the plan flow (monolith JSON.parse'd bare). `packages/shared` untouched. No PR — pushed for lead integration per conventions §4. **Integrated:** merged clean (zero conflicts); gates green on merged tree. Scratch-stack integration proof: reference endpoints serve from the extended gemini DDL, no-key /plan → honest 503, audit tables present (empty — refusal precedes any AI call). **Compose-run note:** the extended DDL needs a fresh gemini-db volume — the user's existing volume predates it, so reset just that volume (see check-in runbook) or reference endpoints will 500 on the missing tables. |
| T1.5 | **email-service** 8085: consumers for `itinerary.created` / `itinerary.shared` / `group.invited`; reminders via RabbitMQ TTL+DLX (`reminders.waiting` → `reminders.due`); SMTP mailer; HTML templates | T0.3 | `task/t1.5-email-service` | **done** | **Verified LIVE end-to-end** (the user's compose stack was still running on localhost, so the full chain ran against real RabbitMQ+Mailpit, not just tsx): all 3 notification emails + a reminder delivered publish→Mailpit in **~30.1s** via the complete TTL+DLX chain (`reminders.waiting` 30s per-message TTL → dead-letter `email.reminder.due` → `reminders.due`); unknown routing keys acked unprocessed; malformed payload retried once then poison-dropped (queue not wedged); `/healthz` 200 with honest broker status while broker retrying; typecheck all workspaces + web build (root .env) + shared smoke + `docker compose config` green. Ships `scripts/publish-test-event.ts` (`npm run publish-test-event -w @smart/email-service`, `[created\|shared\|invited]`, `--start <iso>`; default trip start = 24h30s out so the reminder fires in ~30s during a demo). **Contract gap flagged (shared untouched per conventions):** `ItineraryCreatedEvent`/`ReminderDueEvent` carry only `userId` — no owner address, so confirmation/reminder mail can't be addressed; email-service reads an optional `.passthrough()` `ownerEmail` when publishers include it (demo script does) and otherwise falls back to `OWNER_EMAIL_FALLBACK` env. Ask: add `ownerEmail` to the shared schema + have itinerary-service send it (next shared-touching task). Also flagged: shared broker adapter has no reconnect/error hook, so a mid-session RabbitMQ restart pauses consumption until the container restarts (healthz still 200 — body shows broker state). Head-of-queue TTL caveat (documented in shared adapter, confirmed live): a long reminder ahead of a short one delays the short one — purge `reminders.waiting` if demo reminders don't fire. From T1.6 (producers live, see `services/tools-service/README.md` + `src/eventPublisher.ts`): `group.invited` = {groupId, groupName, email, inviteToken, invitedByEmail} — the invite email must carry a join link/`POST /api/tools/groups/join {inviteToken}`; `itinerary.shared` = {shareToken, itineraryId, groupId?, groupName?, sharedByEmail, recipientEmails[], destination?} — share email links `${WEB_PUBLIC_URL}/shared/<shareToken>`; both published on `si.events` → `email.events` (bindings verified live, 0 consumers until this task). `invitedByEmail`/`sharedByEmail` may be a user id when the token had no email claim — treat as display-only "who". E2E consumption of both events proves out at integration (tools-service containerized). **Integrated:** merged with the 2 predicted conflicts (compose end-of-services, adjacent tracker rows); gates green. Scratch-stack proof of the merged tree: all 3 consumers delivered to Mailpit (invite + share from real tools-service publishes) and the reminder arrived ~30s after publish via the full TTL+DLX chain. T1.7/T1.8 rows carried onto the board as filed. |
| T1.6 | **tools-service** 8084: groups CRUD + email-invite token + join; shares (`POST /shares` → record + token + `itinerary.shared`); `GET /export/itinerary/:id/pdf` → internal fetch → pdfkit → MinIO → presigned URL | T0.3 | `task/t1.6-tools-service` | **done** | New capability (no monolith code existed to port — DDL + shared DTOs were the contract). All 9 routes under `/api/tools/{groups,shares,export}` verified LIVE, not just offline: the compose infra was already running on this machine, so the tsx-booted service was pointed at the real tools-db (5436), MinIO (9000), RabbitMQ (5672) and itinerary-service (8082) via published localhost ports — healthz/401s/zod 400s, create/list/get/delete + visibility scoping (non-owner 404/403), invite 201/409-dup/403-non-owner, single-use join (reuse → 404, race-safe UPDATE), group+direct shares (audience = union), share view returning the REAL seeded aggregate from itinerary-service, `group.invited`+`itinerary.shared` visible in `email.events` (bindings verified, purged after), and a full PDF E2E: export → presigned URL → downloaded a valid 1-page PDF whose content matched the seeded DB itinerary; `pdf_exports`/`itinerary_shares` audit rows checked (incl. group_id → NULL on group delete). Test rows/objects/queue messages cleaned up afterwards; user's running containers untouched. All workspaces typecheck, web build (root .env), shared smoke, fixture render (`npm run render-fixture-pdf -w @smart/tools-service`), compose config — all green. Deviations/notes: (1) GET /groups returns a bare `GroupDto[]` — no list-wrapper contract exists in shared, none added per conventions; (2) invite tokens are carried in `GroupDto.members[]` (passthrough) so joins work without a mail server — production path is the emailed link, documented in README; (3) shareUrl = `${WEB_PUBLIC_URL}/shared/<token>` (browser origin, not compose hostname); (4) dev tokens may omit the email claim → `invitedByEmail`/`sharedByEmail` fall back to `sub`; (5) POST /shares does not verify the itinerary exists (sharing must not depend on itinerary-service being up; mistyped ids 404 at view time — ownership not enforced by itinerary-service GET anyway; flag for T2.5); (6) PDF text is WinAnsi-sanitized (built-in Helvetica has no Unicode; a Unicode font is the future full fix). Containerized path through the gateway + email-service consumption prove out at integration (`docker compose up --build tools-service`). **Integrated:** merged with compose/tracker conflicts (producer-contract flag spliced into T1.5's row; API-consumption flags kept on T2.1/T2.5); gates green; fixture render ALL GREEN. Scratch-stack E2E of the merged tree through the gateway: group create → invite (event→email) → single-use join (token reuse 404) → share to group (event→email) → shared view rendered from an internal itinerary-service fetch → PDF export → MinIO presigned URL → downloaded valid 1-page %PDF. Containerized compose proof remains for the user's machine (this daemon's build pipeline was stalled mid-session; .dockerignore fix committed so builds stay small). |

### Phase 1 follow-ups — shared-contract / adapter debt (small; pick anytime both deps are done)

Flagged during T1.5 (see its Notes). Both are `packages/shared` changes, so
they must land in a shared-touching task per Service conventions §3 — either
standalone or folded into the next task that touches the shared package.

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T1.7 | **shared event contract — owner email**: add `ownerEmail: z.string().email().optional()` to `ItineraryCreatedEventSchema` (ReminderDue inherits it) in `packages/shared/src/events.ts`; in itinerary-service, pass `ownerEmail: claims.email` when calling `publishItineraryCreated` (the claims are already verified in the route — no cross-service call). email-service needs no change: its handler already reads the passthrough field, and `OWNER_EMAIL_FALLBACK` stays as the safety net for claimless tokens (`AuthClaims.email` is optional) | T1.3, T1.5 | `task/t1.7-owner-email` | **done** | Why: confirmation/reminder mail couldn't be addressed from the event alone (fell back to one env address). **Verified LIVE end-to-end on a scratch stack** (scratch mailpit 11025/18025, scratch PG14 5544 with `db/init/itinerary-service.sql`, scratch rabbit 5674/15674 — user's compose untouched): dev token WITH email claim → POST /api/itineraries 201 → confirmation **To: token's email** (not fallback) and reminder delivered ~50s later through the full TTL+DLX chain **also to the token's email** (peeked `reminders.waiting` payload: `ownerEmail` present); claimless token → confirmation correctly still goes to `OWNER_EMAIL_FALLBACK`. Typecheck 0 errors ×8 workspaces; shared smoke ALL GREEN. Notes: (1) hit the documented head-of-queue TTL caveat live (short-TTL reminder stuck behind 2 far-future ones — purged `reminders.waiting`, per the runbook, to demo); (2) `AuthClaimsSchema.email` was already `.email()`-validated, so the new schema field can never reject a verified claim's email (no new publish-drop path); (3) email-service code untouched, only its README's "Known contract gap" section updated to say resolved. |
| T1.8 | **shared broker adapter — connection resilience**: `createBroker` attaches no connection error/close handlers, so a RabbitMQ restart mid-session leaves consumers silently dead with no reconnect; add error/close listeners + either auto-reconnect (re-assert topology, re-consume) or an `onDisconnect` hook, and have email-service flip `/healthz` broker status to `retrying` on disconnect. Verify live: `docker compose restart rabbitmq` while email-service runs → it must re-consume without a container restart | T1.5 | | todo | Why: today the fix is a manual container restart; compose shows the container healthy while it consumes nothing (`/healthz` body does report the stale "connected") |

**📍 Check-in 2** after Phase 1: all services curl-able through gateway; event flow
visible in Mailpit/RabbitMQ UIs; legacy frontend untouched and still working.

### Phase 2 — Frontend rewiring (parallel; disjoint pages)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T2.1 | **api-client** package: typed client over shared DTOs, cookie credentials, `NEXT_PUBLIC_API_URL` default `/api`, mock-mode helpers, error typing | T0.3 | | todo | No service deps — can start as soon as T0.3 merges. From T1.6: tools endpoints live under `/api/tools/{groups,shares,export}` (gateway forwards path-intact; 401 without JWT); `GET /api/tools/groups` returns a **bare `GroupDto[]`** — no list-wrapper contract exists in shared, don't model `{ groups: [...] }`; tools response schemas (`GroupDtoSchema`, `ShareResponseSchema`, `ExportPdfResponseSchema`, `SharedItineraryResponseSchema`) are already in `@smart/shared` |
| T2.2 | **Cognito + web auth flow**: user pool + Google IdP + app client (infra/cognito Terraform + console runbook); rewrite `app/auth/page.tsx` + `/auth/callback` (PKCE, code_verifier cookie → httpOnly session cookie); replace `lib/actions.ts`; `AuthContext` → `GET /api/auth/me`; signout → Cognito end-session; mock mode preserved | T1.1, T1.2, T2.1 | | todo | |
| T2.3 | **Itinerary + hotel pages**: `itinerary/page.tsx` facade → `POST /api/gemini/plan`; `ItineraryTimeline` save → `POST /api/itineraries`; `hooks/useHotels.ts` → `/api/gemini/hotels/search`; `HotelSuggestion`/`HotelSearchResultCard` → API; `hooks/useItinerary.ts` → api-client; drop `NEXT_PUBLIC_GEMINI/AMADEUS` from client env | T1.3, T1.4, T2.1 | | todo | |
| T2.4 | **Profile pages**: `app/profile/[userId]/*` incl. `EditProfileForm` → `/api/auth/*` | T1.2, T2.1 | | todo | |
| T2.5 | **Tools UI**: Export-PDF button on itinerary view; Groups page (create/invite/members); share-to-group action; `app/shared/[token]/page.tsx` read-only view | T1.6, T2.1 | | todo | From T1.6 (all verified live — endpoints table in `services/tools-service/README.md`): (1) `GET /api/tools/groups` returns bare `GroupDto[]`, and `GroupDto.members[]` carries each invited member's `inviteToken` (passthrough) — the Groups page can exercise the join flow without a mail server; production path is the emailed link (T1.5); (2) `POST /api/tools/shares` does **not** verify the itinerary exists (deliberate: sharing must not depend on itinerary-service being up) — share a *saved* itinerary id and treat `GET /api/tools/shares/:token` 404 at view time as the existence check; (3) share links are `${WEB_PUBLIC_URL}/shared/<token>` (browser origin, default `http://localhost:3000`) → `app/shared/[token]/page.tsx` consumes `GET /api/tools/shares/:token` (JWT required — the gateway 401s anonymous traffic, so the viewer needs a session); (4) Export-PDF button consumes `{ downloadUrl, expiresAt, storageKey }` — the download happens browser → MinIO directly, no gateway hop; (5) dev tokens without an email claim fall back to `sub` for `invitedByEmail`/`sharedByEmail` (display-only). |

**📍 Check-in 3** after Phase 2: browser-side `services/` path gone; all e2e green through gateway.

### Phase 3 — Infra, CI, docs (parallel anytime after Phase 0)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T3.1 | CI/CD update: monorepo paths, `docker compose build` + smoke-test job, Cypress e2e against compose (mock auth), keep Aikido SAST | T0.1, T0.2 | | todo | |
| T3.2 | **Terraform AWS scaffold** (NOT applied): vpc-lite, ECR, ECS Fargate ×6 (gateway desired_count=2), RDS ×4 `db.t4g.micro`, S3, Secrets Manager, Cognito, ALB (+optional Route53/WAF), CloudWatch; apply runbook + cost estimate README | T0.3 | | todo | `terraform validate` must pass |
| T3.3 | Docs: `docs/ARCHITECTURE.md` — mermaid diagram mirroring the image, diagram↔repo↔AWS mapping table, event catalogue, local runbook, AWS migration runbook | T0.1 | | todo | |
| T3.4 | Cleanup: remove legacy browser service classes, `lib/supabase`, `app/api/*` stubs, secret `NEXT_PUBLIC_*` vars; root `.env.example`; README rewrite | T2.2–T2.5 | | todo | |

**📍 Check-in 4** (final): compose demo end-to-end, docs complete, CI green.

---

## 3. MVP cutline (if time-boxed)
Skip T3.2 · shrink T2.5 to export + link-share only · T1.5 reminders → confirmation-only.

## 4. Final verification (demo path)
1. `docker compose up -d` → all containers healthy; UIs: RabbitMQ :15672, Mailpit :8025, MinIO :9001
2. `npm run dev:web` → Google login via Cognito (or mock mode offline)
3. Plan itinerary → generated via gemini-service → save → `itinerary.created` in RabbitMQ → confirmation + scheduled reminder in Mailpit
4. Export PDF → downloads from MinIO presigned URL
5. Create group → invite peer → accept → share itinerary → peers get share email → `/shared/<token>` renders read-only
6. `npm run e2e:headless` + `npm run component:headless` green (from `apps/web`); `cypress/api/*` retargeted at gateway :8080
7. `docker compose config` + `terraform -chdir=infra/terraform validate` pass

## 5. Risks / open items
- **Supabase data migration**: DDL is reconstructed from code. If real data must move,
  an export script (Supabase → seed.sql) is a 1–2h add-on — ask the user first.
- **Cognito Google OAuth** requires updating the Google Cloud OAuth client redirect
  URIs (runbook ships with T2.2). Free.
- **SES sandbox** limits recipients to verified addresses — fine for demo.
- **Docker availability**: verify compose tasks on a machine with Docker; in the
  current workspace Docker is not installed, so validate syntactically there.
