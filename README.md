# Smart Itinerary

AI-assisted trip planning: generate a day-by-day itinerary with weather and
flights, search hotels, save trips, share them with a group, export a PDF, and
get email reminders before departure.

This branch (`microservices-develop`) re-platforms the original Next.js
**monolith** into **microservices** that mirror a reference AWS architecture
(ECS services behind an ALB, Cognito auth, RabbitMQ, S3, RDS). The re-platform
follows the strangler pattern — the app stayed working after every merged task —
and the full task-by-task story lives in [`docs/TASKS.md`](docs/TASKS.md).

## The two rules that shape everything

1. **$0, local-first.** The whole stack runs on your laptop with
   `docker compose up` and costs nothing: Postgres instead of RDS, MinIO
   instead of S3, Mailpit instead of SES, a local JWT dev-mode instead of a
   Cognito pool (real Cognito is wired and documented, just not required).
2. **AWS-swappable.** Every local piece speaks the API of the AWS product it
   stands in for. Moving to AWS is an environment-variable change plus the
   checked-in (never applied) Terraform under [`infra/`](infra/terraform/) —
   same Docker images everywhere. The full mapping table is in
   [`docs/LOCAL-VS-AWS.md`](docs/LOCAL-VS-AWS.md).

## Architecture in one picture

```
 browser ──► gateway :8080 ──► auth-service    :8081 ──► auth-db      (Postgres)
                        ├──► itinerary-service :8082 ──► itinerary-db (Postgres)
                        ├──► gemini-service    :8083 ──► gemini-db    (Postgres)
                        └──► tools-service     :8084 ──► tools-db     (Postgres)
                                   │                        │
                                   ▼                        ▼
                        RabbitMQ (si.events)          MinIO (PDF exports)
                                   │
                                   ▼
                        email-service :8085 ──► Mailpit (SMTP inbox)
```

The browser only ever talks to the Next.js app, which proxies same-origin
`/api/*` to the gateway; every service re-verifies the caller's JWT. Detailed
diagrams, the diagram↔repo↔AWS mapping, the event catalogue and runbooks live
in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and each service documents
itself in `services/<name>/README.md`.

## Quickstart

```bash
cp .env.example .env          # add a GEMINI_API_KEY for AI generation (free tier works)
npm install
npm run compose:up            # build + start every container
npm run dev:web               # http://localhost:3000
```

Step-by-step instructions, what to click, and how to verify each flow (plan →
save → email → PDF → share) are in
[`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

## Repository layout

```
apps/web/                     # Next.js app — the only thing a browser talks to
services/gateway/             # 8080 · JWT verify + routing to the services below
services/auth-service/        # 8081 · users, profiles, demographics
services/itinerary-service/   # 8082 · itineraries + days/activities/stays
services/gemini-service/      # 8083 · AI generation, hotels, flights, reference data
services/tools-service/       # 8084 · groups, share links, PDF export (MinIO)
services/email-service/       # 8085 · consumes events, sends mail, reminder scheduler
packages/shared/              # zod DTOs, event schemas, AWS-swappable adapters
packages/api-client/          # typed browser client (+ offline mock mode)
db/init/                      # per-service DDL + demo seeds, applied on first boot
docker-compose.yml            # the full local stack
infra/terraform/              # AWS scaffold — checked in, NEVER applied
docs/                         # TASKS.md (the board) · ARCHITECTURE · GETTING_STARTED
```

## Ports & services

| URL | What |
|---|---|
| http://localhost:3000 | Web app |
| http://localhost:8080/healthz | Gateway (health aggregates every service) |
| http://localhost:8081–8085 | auth · itinerary · gemini · tools · email services |
| http://localhost:15672 | RabbitMQ management UI (guest/guest) |
| http://localhost:8025 | Mailpit — every email the system sends lands here |
| http://localhost:9001 | MinIO console — exported PDFs land here (smart/smart-local-dev) |

## Development

```bash
npm run typecheck             # tsc across every workspace
npm run build                 # all builds (web needs apps/web/.env.local, see its .env.example)
npm run test                  # shared + api-client contract smokes
cd apps/web
npm run e2e:headless          # Cypress end-to-end in mock mode (needs dev web on :3000)
npm run component:headless    # Cypress component tests (no server needed)
npm run cypress:api-test      # gateway smoke specs (needs the compose stack up)
```

Mock mode (`NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`) swaps the API client for a
canned in-memory one, so the whole UI runs with zero services, zero keys and
zero network — that is what the Cypress suites and CI use.

Secrets never ship to the browser: AI/provider keys live only in
gemini-service's environment (see [`.env.example`](.env.example)).
