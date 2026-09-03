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

## Agent Protocol

**Every agent, every branch, no exceptions:**

1. **Before starting** — read this file, pick ONE unclaimed task whose dependencies
   are all `done`, then set its row to `in-progress` with your branch name
   (commit this tracker change on your branch).
2. **Branch naming** — `task/<id>-<slug>`, e.g. `task/t1.2-auth-service`.
   Base your branch on the latest `main` (or the branch of a dependency task if
   that hasn't merged — note it in your PR).
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
| T0.1 | Monorepo scaffold: npm workspaces, app → `apps/web`, service skeletons, workflows | — | (this branch) | **done** | Scaffold applied uncommitted on `terry12321/itinerary-architecture-upgrade`; build+typecheck green; supabase-js pinned 2.48.1 via root override |
| T0.2 | docker-compose + database-per-service DDL (`db/init/*.sql`) | T0.1 | `task/t0.2-compose-infra` | **done** | Infra only: 4× postgres (DDL reconstructed from service code + demo seeds incl. mock-auth user), rabbitmq, minio+bucket init, mailpit. YAML validated; **runtime `docker compose up` pending — Docker not available in agent workspace, run on your machine**. App containers deliberately land with their Phase 1/2 tasks |
| T0.3 | `packages/shared`: move types, zod DTOs, event schemas, adapters (db/storage/mailer/broker/jwt/http) | T0.1 | `task/t0.3-shared-contracts` | **done** | Types moved (web keeps one-line shims so legacy pages keep working); zod DTOs for auth/itineraries/gemini/tools; events + TTL/DLX reminder topology; 6 adapters; smoke test (`npm run smoke -w @smart/shared`) ALL GREEN; all workspaces typecheck + web build green. Deviation: `data/*Schema.ts` stays in web for now (imports Gemini SDK `SchemaType` — vendor-specific; moves to gemini-service in T1.4, not shared) |

**📍 Check-in 1** after Phase 0: app runs from `apps/web`, infra up, contracts published.

### Phase 1 — Services (all parallel; depend only on T0.3)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T1.1 | **gateway** 8080: route table `/api/{auth,itineraries,gemini,tools}/*`, JWT verify (jose+JWKS, cookie+Bearer), rate-limit, helmet, dev-token route (mock only), health aggregation | T0.3 | | todo | |
| T1.2 | **auth-service** 8081: port `UserService` → SQL repos; `GET /me` (upsert from claims), `GET/PATCH /profile`, `GET/PUT /demographics` | T0.3 | | todo | |
| T1.3 | **itinerary-service** 8082: port `ItineraryService` (save/update/get/delete incl. days/activities) → SQL repos; publish `itinerary.created` | T0.3 | | todo | |
| T1.4 | **gemini-service** 8083: move `GeminiService`, `GeminiConfigBuilder`, hotel/flight search, fetch strategies, `ItineraryPlannerFacade`; endpoints `/generate-itinerary`, `/generate-weather`, `/plan`, `/hotels/search`, `/flights/search`, `/reference/*`; keys server-side only; audit rows in own DB | T0.3 | | todo | |
| T1.5 | **email-service** 8085: consumers for `itinerary.created` / `itinerary.shared` / `group.invited`; reminders via RabbitMQ TTL+DLX (`reminders.waiting` → `reminders.due`); SMTP mailer; HTML templates | T0.3 | | todo | |
| T1.6 | **tools-service** 8084: groups CRUD + email-invite token + join; shares (`POST /shares` → record + token + `itinerary.shared`); `GET /export/itinerary/:id/pdf` → internal fetch → pdfkit → MinIO → presigned URL | T0.3 | | todo | |

**📍 Check-in 2** after Phase 1: all services curl-able through gateway; event flow
visible in Mailpit/RabbitMQ UIs; legacy frontend untouched and still working.

### Phase 2 — Frontend rewiring (parallel; disjoint pages)

| ID | Task | Depends | Branch | Status | Notes |
|---|---|---|---|---|---|
| T2.1 | **api-client** package: typed client over shared DTOs, cookie credentials, `NEXT_PUBLIC_API_URL` default `/api`, mock-mode helpers, error typing | T0.3 | | todo | No service deps — can start as soon as T0.3 merges |
| T2.2 | **Cognito + web auth flow**: user pool + Google IdP + app client (infra/cognito Terraform + console runbook); rewrite `app/auth/page.tsx` + `/auth/callback` (PKCE, code_verifier cookie → httpOnly session cookie); replace `lib/actions.ts`; `AuthContext` → `GET /api/auth/me`; signout → Cognito end-session; mock mode preserved | T1.1, T1.2, T2.1 | | todo | |
| T2.3 | **Itinerary + hotel pages**: `itinerary/page.tsx` facade → `POST /api/gemini/plan`; `ItineraryTimeline` save → `POST /api/itineraries`; `hooks/useHotels.ts` → `/api/gemini/hotels/search`; `HotelSuggestion`/`HotelSearchResultCard` → API; `hooks/useItinerary.ts` → api-client; drop `NEXT_PUBLIC_GEMINI/AMADEUS` from client env | T1.3, T1.4, T2.1 | | todo | |
| T2.4 | **Profile pages**: `app/profile/[userId]/*` incl. `EditProfileForm` → `/api/auth/*` | T1.2, T2.1 | | todo | |
| T2.5 | **Tools UI**: Export-PDF button on itinerary view; Groups page (create/invite/members); share-to-group action; `app/shared/[token]/page.tsx` read-only view | T1.6, T2.1 | | todo | |

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
