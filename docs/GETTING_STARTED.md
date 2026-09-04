# Getting Started — running Smart Itinerary locally

This guide is for anyone who cloned this repo and wants to see the system run:
what it is, why each command looks the way it does, and how to verify it works —
no prior microservices experience assumed.

> Looking for the architecture (why services are split this way, how it maps to
> the AWS diagram)? See `docs/TASKS.md` §1 and each service's own
> `services/<name>/README.md`. This file is only about **running and checking** it.

---

## 1. What this project is

Smart Itinerary is a trip-planning app (AI-generated itineraries, hotels,
flights, group sharing, email reminders). It started life as a **Next.js
monolith** — one app doing everything, including talking to the database
straight from the browser. This branch (`microservices-develop`) re-platforms it
into **microservices** that mirror a reference AWS architecture:

```
 browser ──► gateway :8080 ──► auth-service        :8081 ──► auth-db        (Postgres)
                        ├──► itinerary-service     :8082 ──► itinerary-db     (Postgres)
                        ├──► gemini-service        :8083 ──► gemini-db        (Postgres)
                        └──► tools-service         :8084 ──► tools-db         (Postgres)
                                   │
                                   ▼
                        RabbitMQ (events) ──► email-service :8085 ──► Mailpit (SMTP)
                                   tools-service ──► MinIO (S3-compatible file storage)
```

On AWS these boxes would be ECS containers, RDS databases, Amazon MQ, S3 and
SES. For development we run the **same architecture on your laptop for $0**:
each box becomes a Docker container, and each AWS product is swapped for a
local, API-compatible equivalent (Postgres ↔ RDS, MinIO ↔ S3, Mailpit ↔ SES).
The swap is environment variables only — the code doesn't change.

## 2. Why Docker? Why `docker compose up --build -d`?

**Why containers at all?** The whole point of the re-platform is that the app is
now ~10 cooperating processes (4 services + 4 databases + broker + mail server
+ file storage). Installing and wiring all of that by hand on every machine is
exactly the error-prone work containers eliminate. A container packages one
service with its runtime; Docker Compose describes the whole fleet in one file
(`docker-compose.yml`) and runs it with one command — including the correct
startup order (a service waits for its database to report healthy before
booting), networking (services find each other by name: the gateway literally
calls `http://auth-service:8081`), and isolated storage volumes.

**Each part of the command:**

| Piece | Why it's there |
|---|---|
| `docker compose` | Read `docker-compose.yml` and manage the whole fleet as one unit |
| `up` | Create and start every container the file describes |
| `--build` | **Rebuild the images from the current source code first.** Images are snapshots — without this flag you'd run stale code. Any time you `git pull` or edit a service, re-run with `--build` |
| `-d` | Detached mode: containers run in the background and the terminal stays free. Watch them with `docker compose ps` / `docker compose logs -f <name>` instead |

So the routine after every `git pull` is:

```bash
git checkout microservices-develop
git pull origin microservices-develop   # get the latest integrated code
docker compose up --build -d            # rebuild + (re)start everything that changed
docker compose ps                       # wait until every service shows "healthy"
```

## 3. Prerequisites

- **Docker Desktop** (running) — provides the `docker` and `docker compose` commands
- **Node.js 20+** — only for running the web app (`npm run dev:web`) and tests; the backend services run entirely in Docker
- Free ports: 3000, 8080–8085, 5433–5436, 5672, 8025, 9000, 9001, 15672

## 4. Verifying it works — why curl?

With microservices there's no single "open the browser and see it" moment: the
value is in the **hops** between services. `curl` lets you walk those hops one
at a time, exactly the way the web app's API client does, and see each raw
response. Every command below is copy-pasteable.

### 4.1 Is everything alive? — `GET /healthz`

```bash
curl -s http://localhost:8080/healthz
```

The gateway checks itself **and** every upstream service, and reports the truth
per service. While the system is partially built (services land in waves — see
`docs/TASKS.md` for current status) you'll see something like:

```json
{"status":"degraded","service":"gateway","upstreams":{
  "auth-service":{"status":"up","url":"http://auth-service:8081","latencyMs":2},
  "itinerary-service":{"status":"up","url":"http://itinerary-service:8082","latencyMs":2},
  "gemini-service":{"status":"down","url":"http://gemini-service:8083","reason":"fetch failed"},
  "tools-service":{"status":"down","url":"http://tools-service:8084","reason":"fetch failed"}}}
```

**How to read this:** `up` = that container answered. `down` with
`"fetch failed"` = *nothing is listening at that address yet* — a service that
hasn't been built/started, **not an error**. The overall status is `degraded`
rather than `ok` whenever any upstream is down; the gateway itself stays up.
This is deliberate: one dead dependency must never crash the front door.

### 4.2 Get a token — `POST /api/auth/dev-token`

Real logins go through Amazon Cognito (Google sign-in). That needs cloud
setup, so in development the gateway can **mint mock tokens**:

```bash
curl -s -X POST http://localhost:8080/api/auth/dev-token \
     -H "Content-Type: application/json" \
     -d '{"sub":"11111111-2222-3333-4444-555555555555","email":"demo@test.local","name":"Demo User"}'
```

Response: `201 {"token":"eyJ...","claims":{...}}`. Three things to know:

- **You don't need a token to call this endpoint** — it's the endpoint that
  *gives* you one. It's public by design so automated tests (Cypress) and
  quick curl checks work without Cognito.
- `sub` is the user id the rest of the system will see, and it **must be a
  UUID** — auth-service upserts it into a `uuid` database column, so a plain
  word like `"dev-user"` fails with a 500 (reproduced and fixed: the default is
  now the seeded demo user). Omitting the body entirely is the easy path: it
  mints a token for the seeded mock-auth user `1b9472e1-a85e-43bf-9898-6f44e2b20809`
  ("Test User" from `db/init/auth-service.sql`), so `GET /api/auth/me` returns a
  ready-made profile.
- It only exists when the gateway runs with `TOKEN_VERIFY_MODE=dev` (the
  docker-compose default). In production mode it answers 404.

### 4.3 Call a protected route — `GET /api/auth/me`

```bash
TOKEN=<paste the token from the previous response>
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/auth/me
```

This exercises the **full request path**: browser-equivalent call → gateway
(verifies the JWT, rate-limits, forwards) → auth-service (re-verifies the token,
upserts your profile) → its Postgres. Expected: `200` with
`{"user":{...,"userDemographics":{...}}}`. The profile row was really written —
check with the database directly if you like:

```bash
docker compose exec auth-db psql -U smart -d smart_auth -c "SELECT id, email FROM users;"
```

> **Auth detail:** the gateway also accepts the token as an `si_session` cookie
> (that's how the web app logs in). `Authorization: Bearer` is just the easier
> shape for curl.

### 4.4 Save and list an itinerary — the write path

```bash
# save (note: userId must match the sub you minted the token with)
curl -s -X POST http://localhost:8080/api/itineraries \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"userId":"11111111-2222-3333-4444-555555555555",
          "itinerary":{"id":null,"sourceCountry":"Singapore","destination":"Tokyo",
            "startDate":"2026-10-01","endDate":"2026-10-05","estimatedTotalCost":2500,
            "importantNotes":[],"demographics":{},"accommodation":[],"itineraryDays":[]},
          "weatherForecast":{}}'
# → 201 {"itineraryId":"1"}

# read it back
curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/itineraries/user/11111111-2222-3333-4444-555555555555
# → 200 {"itineraries":[{"id":"1","destination":"Tokyo",...}]}
```

A successful save also publishes an `itinerary.created` event to RabbitMQ —
see the UIs below.

### 4.5 The web app

```bash
npm install   # once per clone
npm run dev:web   # http://localhost:3000
```

The frontend calls the gateway through a same-origin rewrite (`/api/:path*` →
`localhost:8080`), so from the browser's point of view it's one origin. Legacy
pages still talk to the old monolith paths while the migration is in progress
(strangler pattern — see `docs/TASKS.md` §1.3).

## 5. How the database seeds itself (and how users are created)

**You never create users or run SQL by hand.** Two mechanisms do the work:

**1 — Databases seed themselves on first boot.** Each database container mounts
its DDL file into the official Postgres image's init directory:

```yaml
auth-db:
  volumes:
    - ./db/init/auth-service.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
    - auth-db-data:/var/lib/postgresql/data
```

The official `postgres` image runs everything in `/docker-entrypoint-initdb.d/`
**once, when its data directory is empty** — i.e., the first `docker compose up`
after the volume is created. The script creates the tables *and* inserts seed
data, including the mock-auth demo user `1b9472e1-a85e-43bf-9898-6f44e2b20809`
("Test User", with demographics already filled in). That's the user the default
dev token (§4.2) maps to — your first `docker compose up` already seeded it,
and the `auth-db-data` volume keeps it.

> **Gotcha:** init scripts run only on an **empty** volume. If `db/init/*.sql`
> changes in a later task, an existing database volume keeps its old schema —
> do a full reset (`docker compose down -v`, then `up`) to re-seed.

**2 — Users are created lazily from tokens.** There is no signup endpoint.
The first time `GET /api/auth/me` sees a token whose `sub` is a UUID the
database hasn't stored, auth-service upserts a profile row from the token
claims (name, email). So any UUID you mint a dev token for becomes a real user
on first contact — which is also why a non-UUID `sub` fails (§4.2). The seeded
user simply pre-exists so the default dev token has a ready-made profile, and
Cypress can log in deterministically. In Phase 2, Cognito replaces dev-token,
and real Google logins go through the same upsert path.

| You want to… | Do this |
|---|---|
| Check the seed is really there | `docker compose exec auth-db psql -U smart -d smart_auth -c "SELECT id, name, email FROM users;"` |
| Look at saved itineraries | `docker compose exec itinerary-db psql -U smart -d smart_itinerary -c "SELECT id, destination FROM itineraries;"` |
| Total reset (wipe ALL data) | `docker compose down -v` ⚠️ then `docker compose up --build -d` — volumes deleted, next boot re-runs DDL + seeds |

## 6. The web UIs (what each container gives you)

| URL | What | Why it's useful |
|---|---|---|
| `http://localhost:15672` | **RabbitMQ management** (login `guest` / `guest`) | See the `si.events` exchange and message publish rates. Saving an itinerary publishes `itinerary.created` here — the email service (once running) consumes it and sends mail |
| `http://localhost:8025` | **Mailpit** — fake inbox | Every email the system "sends" lands here instead of real inboxes. Free, instant, no spam risk |
| `http://localhost:9001` | **MinIO console** (login `smart` / `smart-local-dev`) | S3-compatible file storage; exported itinerary PDFs land in the `si-files` bucket |

## 7. Ports cheat-sheet

| Port | Thing |
|---|---|
| 3000 | web app (`npm run dev:web`) |
| 8080 | **gateway** — the only API port clients need |
| 8081 / 8082 / 8083 / 8084 / 8085 | auth / itinerary / gemini / tools / email services (reachable directly for debugging) |
| 5433–5436 | the four Postgres databases (one per service — mirroring RDS ×4) |
| 5672 / 15672 | RabbitMQ AMQP / management UI |
| 1025 / 8025 | Mailpit SMTP / web inbox |
| 9000 / 9001 | MinIO S3 API / console |

## 8. Useful commands

```bash
docker compose ps                     # what's running, healthy or not
docker compose logs -f gateway        # follow one service's logs (any service name works)
docker compose up --build -d gateway  # rebuild+restart ONE service after its code changed
docker compose stop                   # stop everything, keep data
docker compose start                  # ...and resume
docker compose down                   # stop + remove containers (data volumes survive)
docker compose down -v                # ⚠️ also DELETE the database volumes — full reset
```

## 9. Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `upstream ... "reason":"fetch failed"` in `/healthz` | That service isn't running yet (not built, or not part of the current milestone). Check `docs/TASKS.md` for what should exist |
| `port is already allocated` on `docker compose up` | Another process (often a previous stack) owns the port: `lsof -i :8080`, stop it, retry |
| A service restarts forever in `docker compose ps` | `docker compose logs <name>` — usually its database wasn't healthy in time, or an env var is missing |
| `{"error":"No route for GET /x"}` (JSON) | You reached a real service but used a path it doesn't serve — check that service's README endpoints table |
| `Cannot GET /x` (HTML) | Same idea from Express's default handler — also a wrong path |
| `401 {"error":...}` on a protected route | Missing/expired token — mint a fresh one (§4.2) |
| `400 ... "Invalid uuid"` | Itinerary routes take the user id from the URL and require a UUID — use the `sub` value from your token (the default dev token's `sub` is the seeded demo user `1b9472e1-a85e-43bf-9898-6f44e2b20809`) |
| Code changes don't appear | Images are snapshots: re-run `docker compose up --build -d` (add the service name to rebuild just one) |

## 10. Where to read next

- `docs/TASKS.md` — the single source of truth: PRD, architecture table, task board and current status
- `services/<name>/README.md` — each service's endpoints, env vars and a request walkthrough
- `packages/shared/` — the zod contracts every service speaks (request/response shapes live here)
