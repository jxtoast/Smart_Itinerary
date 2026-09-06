# Smart Itinerary — Architecture

This document is the map between the **reference AWS architecture diagram**
(the target of the re-platform, specified in `docs/TASKS.md` §1) and the
**code in this repository**. A first-time reader should be able to point at any
box in the diagram and find the exact file that implements it — and run the
whole thing on a laptop for $0 — without asking anyone.

**Other docs, and what they are for:**

| Question | Doc |
|---|---|
| How do I run and verify it? | `docs/GETTING_STARTED.md` |
| Why Postgres/MinIO/Mailpit instead of "real" AWS — is that a compromise? | `docs/LOCAL-VS-AWS.md` (no — each stand-in is the same product or the same API) |
| PRD, hard constraints, task board | `docs/TASKS.md` |
| Each service's endpoints, env vars, request walkthrough | `services/<name>/README.md` |

---

## 1. The target architecture (mirrors the AWS diagram)

```mermaid
flowchart TB
    subgraph clients["Clients"]
        direction LR
        web["Web (Next.js app, apps/web)"]
        mobile["Mobile"]
        third["Third party"]
    end

    subgraph aws["AWS (Terraform scaffold in infra/ — checked in, never applied)"]
        r53["Route 53 (DNS)"] --> waf["AWS WAF"] --> alb["Application Load Balancer"]

        subgraph gwlayer["API layer"]
            gw1["API Gateway — instance 1"]
            gw2["API Gateway — instance 2"]
            cognito["Amazon Cognito<br/>(user pool + Google federation)"]
        end

        subgraph services["Services (ECS Fargate, auto-scaled)"]
            tools["Tools Service<br/>(Export PDF, Sharing)"]
            authsvc["Authentication Service<br/>(User Profile)"]
            itin["Itinerary Service"]
            gem["Gemini Service<br/>(Hotel Service)"]
        end

        subgraph statelayer["State & messaging"]
            rdsTools[("RDS — Tools DB")]
            rdsAuth[("RDS — Auth DB")]
            rdsItin[("RDS — Itinerary DB")]
            rdsGem[("RDS — Gemini DB")]
            mq["Message Broker<br/>(RabbitMQ)"]
            emailsvc["Email Service"]
            s3["Amazon S3<br/>(File Storage)"]
            sm["AWS Secrets Manager"]
        end
    end

    web -- "same-origin /api/*" --> r53
    mobile --> r53
    third --> r53
    alb --> gw1
    alb --> gw2
    gw1 -. "verify JWT (JWKS)" .-> cognito
    gw2 -. "verify JWT (JWKS)" .-> cognito
    gw1 --> tools
    gw1 --> authsvc
    gw1 --> itin
    gw1 --> gem
    gw2 --> tools
    gw2 --> authsvc
    gw2 --> itin
    gw2 --> gem
    tools --> rdsTools
    authsvc --> rdsAuth
    itin --> rdsItin
    gem --> rdsGem
    itin -- "itinerary.created" --> mq
    tools -- "itinerary.shared / group.invited" --> mq
    mq -- "notifications + due reminders" --> emailsvc
    tools -- "PDF upload + presigned URLs" --> s3
    sm -.-> services

    subgraph cicd["CI/CD row"]
        direction LR
        ghRepo["GitHub (source)"] --> actions["GitHub Actions<br/>(build + tests + SAST)"] --> ecr["Amazon ECR<br/>(Docker images)"] --> ecsDeploy["Amazon ECS<br/>(deploy the services)"] --> cw["CloudWatch<br/>(logs + monitoring)"]
    end
    ecsDeploy -. "deploys" .-> services
```

Two documented fidelity notes about the diagram itself (both decisions recorded
in `docs/TASKS.md` §1.2):

1. **The diagram's "CodeCommit" box is GitHub.** AWS CodeCommit is closed to new
   customers, so GitHub is the source of truth and GitHub Actions is the CI
   (`.github/workflows/`). The rest of the row — ECR → ECS → CloudWatch — is
   scaffolded in `infra/` Terraform.
2. **The two "API Gateway instance" boxes are one service deployed twice.**
   `services/gateway` is a stateless Express app; the ECS task definition in
   the `infra/` Terraform sets `desired_count = 2`, which reproduces the
   diagram's two instances exactly.

---

## 2. One real request, end to end

The fastest way to understand the system is to follow one feature: **planning
and saving a trip**. The diagram below is not an abstraction — every hop names
the code that performs it.

**Synchronous path** — browser → Next.js rewrite → gateway → service → its
database (here: saving an itinerary):

```mermaid
sequenceDiagram
    autonumber
    actor U as Browser (web :3000)
    participant N as Next.js (same-origin /api/* rewrite)
    participant G as gateway :8080
    participant I as itinerary-service :8082
    participant DB as itinerary-db (Postgres)
    U->>N: POST /api/itineraries<br/>(si_session cookie)
    Note over N: apps/web/next.config.ts rewrites<br/>/api/:path* → gateway (API_GATEWAY_URL)
    N->>G: forward /api/itineraries (same origin, server-side)
    G->>G: rate-limit → JWT verify (jose)<br/>Bearer header or si_session cookie
    Note over G: route table: /api/itineraries/* → ITINERARY_SERVICE_URL<br/>path forwarded unchanged
    G->>I: forward (path + auth headers intact)
    I->>I: requireClaims() re-verifies the token<br/>+ zod validates the body
    I->>DB: INSERT itinerary + days + activities<br/>(one transaction)
    I->>I: publish itinerary.created (best-effort)
    I-->>G: 201 {"itineraryId":"…"}
    G-->>U: 201 (relayed verbatim)
```

**Asynchronous path** — the same save also fires an event; the email-service
turns it into mail without the caller ever waiting for it:

```mermaid
sequenceDiagram
    autonumber
    participant I as itinerary-service :8082
    participant MQ as RabbitMQ (exchange si.events)
    participant E as email-service :8085
    participant M as Mailpit :8025 (SMTP sink)
    I->>MQ: publish "itinerary.created"<br/>(ownerEmail from the verified JWT)
    MQ->>E: deliver on queue email.events
    E->>M: confirmation email (SMTP)
    E->>MQ: scheduleReminder → queue reminders.waiting<br/>with per-message TTL = time until 24h before trip start
    Note over MQ: TTL expires → RabbitMQ dead-letters the message<br/>back onto si.events as "email.reminder.due"
    MQ->>E: deliver on queue reminders.due
    E->>M: "your trip starts soon" reminder email
```

Three properties worth noticing on these paths:

- **The browser only ever talks to its own origin.** The Next.js rewrite
  (`apps/web/next.config.ts`) proxies `/api/*` to the gateway server-side, so
  no service port is exposed to the browser and no API keys can leak there.
- **Every service re-verifies the JWT.** The gateway verifies first
  (the front door), then each service re-verifies with the same
  `requireClaims` helper from `packages/shared` — no service trusts a claim
  forwarded by another service.
- **Events are best-effort, saves are not.** If RabbitMQ is down, the save
  still returns 201 and the publish failure is only logged — a notification
  outage must never fail the user's write.

**The whole plan-a-trip story in one paragraph.** The user fills the plan form
on `localhost:3000`; the page calls `POST /api/gemini/plan`, which rides the
same rewrite → gateway → service path shown above but ends at gemini-service,
where the `/plan` facade calls Google Gemini for a day-by-day itinerary and a
weather forecast plus Amadeus for flight offers (each part independently
nullable — an Amadeus outage degrades, never fails), auditing every AI call in
gemini-db (`services/gemini-service/README.md` has the full table). The user
hits save; the `POST /api/itineraries` request from the diagrams above writes
the aggregate to itinerary-db and publishes `itinerary.created`; email-service
sends the confirmation to Mailpit and parks a reminder that fires 24 h before
the trip starts. From there the trip can be exported to a PDF (tools-service →
MinIO → presigned URL, downloaded browser-direct) and shared to a group or
email list (`itinerary.shared` → share-link emails), all through the same
gateway front door.

---

## 3. Diagram box → code → AWS → local stand-in

The complete mapping. "Compose stand-in" is what actually runs on your laptop
(`docker-compose.yml`); the AWS column is what the same code targets after the
env-var swap (§6).

| Diagram box | Repo path | AWS (target) | Local compose stand-in |
|---|---|---|---|
| Clients (Web / Mobile / Third Party) | `apps/web/` (Next.js); any HTTP client with a valid JWT | — (client side) | browser on `localhost:3000` (`npm run dev:web`) |
| Route 53 → WAF → ALB | no code — a deployment concern | Route 53 + WAF + ALB | not needed locally — the browser reaches localhost directly |
| API Gateway Instance 1 / Instance 2 | `services/gateway/` (Express, :8080); route table `src/upstreams.ts` | ECS service, `desired_count = 2` | `gateway` container :8080 |
| Amazon Cognito (Auth) | `infra/cognito/` (pool + Google federation + PKCE app client — Terraform, never applied); JWT verification `packages/shared/src/adapters/jwt.ts`; web flow `apps/web/app/auth/*` | Cognito user pool (free tier) | `TOKEN_VERIFY_MODE=dev` — the gateway mints HS256 dev tokens (`POST /api/auth/dev-token`) |
| Authentication Service (User Profile) | `services/auth-service/` (:8081) | ECS task | `auth-service` container :8081 |
| Itinerary Service | `services/itinerary-service/` (:8082) | ECS task | `itinerary-service` container :8082 |
| Gemini Service (Hotel Service) | `services/gemini-service/` (:8083) | ECS task | `gemini-service` container :8083 |
| Tools Service (Export PDF, Sharing) | `services/tools-service/` (:8084) | ECS task | `tools-service` container :8084 |
| RDS ×4 (database-per-service) | `db/init/<service>.sql` (DDL + seed); repositories `services/*/src/repositories/` | 4× RDS Postgres | 4× `postgres:16-alpine` — `auth-db` :5433, `itinerary-db` :5434, `gemini-db` :5435, `tools-db` :5436 |
| Message Broker (RabbitMQ) | `packages/shared/src/adapters/broker.ts` + `packages/shared/src/events.ts` (topology, event schemas) | Amazon MQ (RabbitMQ engine) | `rabbitmq` container :5672 (management UI :15672) |
| Email Service | `services/email-service/` (:8085) | ECS task | `email-service` container :8085 |
| (Email delivery) | `packages/shared/src/adapters/mailer.ts` (SMTP) | Amazon SES (SMTP interface) | `mailpit` container :1025 (web inbox :8025) |
| Amazon S3 (File Storage) | `packages/shared/src/adapters/storage.ts` (official `@aws-sdk/client-s3`) | S3 bucket | `minio` container :9000 (console :9001), bucket `si-files` |
| AWS Secrets Manager | server-side env only — root `.env` (gitignored) for compose | Secrets Manager | root `.env` |
| CI/CD: CodeCommit → Actions → ECR → ECS → CloudWatch | `.github/workflows/preview.yaml`, `.github/workflows/production.yaml`; image builds `services/*/Dockerfile` | ECR + ECS + CloudWatch via `infra/` | GitHub is the source (CodeCommit closed to new customers); Actions run build + Cypress (mock auth) + Aikido SAST today, deploying the web app to Vercel — the scaffolds extend the same pipeline to ECR/ECS |

Everything in the "Repo path" column exists in this repository — including the
Terraform scaffolds, which are **checked in but never applied** (see §6).

---

## 4. Event catalogue

All events flow through one durable **topic exchange `si.events`** (constants
and zod schemas: `packages/shared/src/events.ts`; topology:
`packages/shared/src/adapters/broker.ts`).

| Event (routing key) | Publisher | Consumer | Queue / binding | What it triggers |
|---|---|---|---|---|
| `itinerary.created` | itinerary-service, after a successful save (`src/itineraryCreatedPublisher.ts`) | email-service | `email.events` (bound to `itinerary.*`) | Confirmation email to the trip owner **plus** a reminder scheduled (row below). Payload carries `ownerEmail` from the verified JWT; when a token had no email claim, the mail falls back to `OWNER_EMAIL_FALLBACK`. |
| `itinerary.shared` | tools-service, `POST /api/tools/shares` (`src/eventPublisher.ts`) | email-service | `email.events` (bound to `itinerary.*`) | One read-only share link (`${WEB_PUBLIC_URL}/shared/<token>`) per address in `recipientEmails[]`. |
| `group.invited` | tools-service, `POST /api/tools/groups/:id/invites` | email-service | `email.events` (bound to `group.*`) | Invitation email containing the single-use `inviteToken` (join = `POST /api/tools/groups/join`). |
| `email.reminder.due` | RabbitMQ itself — the `reminders.waiting` message TTL expiring | email-service | `reminders.waiting` → dead-letter → `si.events` → `reminders.due` | "Your trip starts soon" email, fired **24 h before the start date** (`REMINDER_HOURS_BEFORE_TRIP`). |

**How reminders work without a scheduler.** `reminders.waiting` is a holding
queue with no exchange binding. A reminder is published **directly** to it with
a per-message TTL equal to the delay until 24 h before the trip starts; when
the TTL expires, RabbitMQ dead-letters the message back onto `si.events` with
routing key `email.reminder.due` (`x-dead-letter-exchange` / `x-dead-letter-routing-key`
queue arguments). No delayed-message plugin, no cron — the broker's native
TTL + DLX mechanism is the timer. One caveat (documented in the adapter and
confirmed live): RabbitMQ expires TTLs from the **head** of the queue, so a
long-delay reminder ahead of a short one delays the short one.

**Broker behaviour notes** (all in `packages/shared/src/adapters/broker.ts`):

- **At-least-once delivery** — messages are acked only after the handler
  succeeds; a crash between send and ack can duplicate an email (acceptable for
  notifications). A malformed payload is retried once, then dropped as poison
  so one bad publisher can't wedge the queue; unknown routing keys are acked
  unprocessed.
- **Auto-reconnect** — the connection is supervised: on loss the adapter flips
  its status to `retrying` (email-service mirrors this into `/healthz`), reconnects
  with bounded backoff (1 s → 2 s → 4 s … capped 30 s), re-asserts the whole
  topology and replays every registered consumer. A RabbitMQ restart never
  needs a container restart.
- **Fail-soft publishing** — `publish()` throws into the caller's existing
  error handling rather than buffering; itinerary/tool saves are never failed
  by a broker outage (events are best-effort notifications).

---

## 5. Services: ports, responsibilities, auth

### Ports and one-line responsibilities

| Port | Thing | Responsibility (one line) |
|---|---|---|
| 3000 | web (`apps/web`, Next.js) | The UI; proxies same-origin `/api/*` to the gateway via the `next.config.ts` rewrite |
| 8080 | gateway (`services/gateway`) | The single front door: JWT verification, rate limiting, helmet, transparent route table to the four services, `/healthz` aggregation |
| 8081 | auth-service | Owns user profiles + travel demographics (`users`, `users_demographics`); upserts profiles from verified token claims |
| 8082 | itinerary-service | Owns saved trip aggregates (itinerary + days + activities + accommodation); publishes `itinerary.created` |
| 8083 | gemini-service | The AI engine: day-by-day itinerary + weather generation, the `/plan` facade (+ Amadeus flights), hotel search, reference data; audits every AI call in its own DB |
| 8084 | tools-service | Groups + single-use email invites + share links; PDF export (pdfkit → S3/MinIO → presigned URL) |
| 8085 | email-service | Consumes broker events into emails (confirmation / share / invite / reminder); the only service with **no database** (AMQP-only) |
| 5433–5436 | `auth-db` / `itinerary-db` / `gemini-db` / `tools-db` | One Postgres per service — the database-per-service rule; DDL + seed in `db/init/*.sql` |
| 5672 / 15672 | `rabbitmq` | AMQP / management UI (`guest`/`guest`) — the `si.events` exchange and reminder queues |
| 1025 / 8025 | `mailpit` | SMTP sink / web inbox — every email lands here instead of a real address |
| 9000 / 9001 | `minio` | S3 API / console (`smart` / `smart-local-dev`) — exported PDFs in bucket `si-files` |

Services never import each other — they share only the contracts in
`packages/shared` (zod DTOs, event schemas, adapters). The one legal
service-to-service HTTP dependency (tools-service → itinerary-service to fetch
an itinerary aggregate for share views and PDF export) goes through an env-var
URL (`ITINERARY_SERVICE_URL`) and forwards the *caller's own credentials* — no
shared database, no trust shortcut.

### Auth modes — one contract, two token sources

Every protected route accepts the token from the `Authorization: Bearer`
header **or** the `si_session` httpOnly cookie, verifies it at the gateway,
and re-verifies it in the service (`packages/shared/src/adapters/jwt.ts`,
`requireClaims`). The mode switch is one env var:

| | `TOKEN_VERIFY_MODE=dev` (compose default) | `TOKEN_VERIFY_MODE=cognito` |
|---|---|---|
| Token shape | HS256, signed with `JWT_DEV_SECRET` | RS256 from the Cognito user pool, verified against its JWKS (`COGNITO_ISSUER` + `COGNITO_CLIENT_ID`) |
| Who issues tokens | the gateway's `POST /api/auth/dev-token` (public, exists **only** in dev mode — answers 404 in cognito mode; body optional, defaults to the seeded demo user) | Amazon Cognito: `/auth/start` → hosted UI (Google federation, PKCE) → `/auth/callback` does the server-side code exchange → sets `si_session` |
| Used by | local dev, Cypress, curl demos | real sign-ins (pool ships as `infra/cognito/` Terraform — see its RUNBOOK) |

A third mode is **purely frontend** and often confused with dev-token mode:
`NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` makes the web app's `AuthContext` return a
canned "Test User" with no network calls at all — that is what CI's Cypress run
uses offline. Dev-token mode still exercises the whole gateway → service → DB
path; mock mode exercises none of it.

---

## 6. The AWS migration path

**Status: the Terraform in `infra/` is checked in and never applied — the whole
system runs on localhost for $0** (hard constraint `docs/TASKS.md` §1.3). The
guarantee that makes this safe: **the same Docker images run in both worlds.**
Every difference below is an environment variable; no service code changes.
(The full "why each stand-in is the real thing" analysis lives in
`docs/LOCAL-VS-AWS.md` — this table is the mechanical swap.)

| Concern | Local (compose default) | AWS |
|---|---|---|
| Database (×4) | `DATABASE_URL=postgres://smart:smart@auth-db:5432/smart_auth` | same var → the RDS endpoint (Terraform scaffold) |
| Broker | `AMQP_URL=amqp://guest:guest@rabbitmq:5672` | same var → Amazon MQ (RabbitMQ engine); topology identical |
| Object storage | `S3_ENDPOINT=http://minio:9000` + `S3_PUBLIC_ENDPOINT=http://localhost:9000` + `S3_FORCE_PATH_STYLE=true` | unset both endpoint vars (real S3 URLs are public), `S3_FORCE_PATH_STYLE=false`, bucket credentials via IAM |
| Email | `SMTP_HOST=mailpit`, `SMTP_PORT=1025` | Amazon SES SMTP interface — same mailer adapter, SES host/port/credentials |
| Auth | `TOKEN_VERIFY_MODE=dev` + `JWT_DEV_SECRET` | `TOKEN_VERIFY_MODE=cognito` + `COGNITO_ISSUER` + `COGNITO_CLIENT_ID` — every service (gateway + 4) flips together, per `infra/cognito/RUNBOOK.md` |
| AI keys | root `.env` (`GEMINI_API_KEY`, `AMADEUS_API_KEY`) — server-side env of gemini-service | Secrets Manager (Terraform scaffold) → same container env vars |
| Deployment | `docker compose up --build -d` | ECS via the `infra/` Terraform (gateway `desired_count = 2`, one task per service, RDS ×4, S3, ALB) — checked in, **never applied**, $0 |
| CI | GitHub Actions (`.github/workflows/`) — build, Cypress (mock auth), Aikido SAST | the same Actions pipeline extended to push images to ECR and deploy to ECS (T3.1/T3.2 scaffolds) |

Runbooks that turn this table into clicks:

- `docs/GETTING_STARTED.md` — run the local stack and verify every hop
- `infra/cognito/RUNBOOK.md` — create the real Cognito pool (~10 min, free
  tier, `terraform destroy` afterwards) and flip the services to cognito mode
- `docs/LOCAL-VS-AWS.md` — why each compose stand-in is the real thing, and
  what actually (optionally) reaches the internet
