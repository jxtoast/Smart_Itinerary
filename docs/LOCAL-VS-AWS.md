# Local vs AWS — every "free alternative" and why it's the real thing

This file answers one question a first-time reader (or a worried teammate)
always asks: **"the AWS diagram says Cognito / RDS / S3 / SES — so what are all
these other things in `docker-compose.yml`, and are they a compromise?"**

Short answer: **no.** The project's hard rule is *$0 cost* and *AWS-swappable*
(`docs/TASKS.md` §1.3). Each local piece is the **same technology (or the same
API) the diagram names, running on your laptop**. The code is written against
the AWS-shaped contract; pointing it at AWS later is an environment-variable
change, not a rewrite.

> Just want to run it? See `docs/GETTING_STARTED.md`.
> Want the PRD/architecture rules? See `docs/TASKS.md` §1.

---

## 1. The mapping — diagram box → what runs locally

| AWS diagram box | Local (free) equivalent | What it does for us | Why it fulfills the same goal | AWS swap |
|---|---|---|---|---|
| **RDS ×4** (database-per-service) | **Postgres ×4** in Docker (`auth-db`, `itinerary-db`, `gemini-db`, `tools-db`) | Each microservice owns its own database — the core microservices rule | RDS *is* managed Postgres. Same engine, same SQL, same `pg` driver, same DDL files (`db/init/*.sql`) | Set `DATABASE_URL` to the RDS endpoint — nothing else changes |
| **Amazon S3** | **MinIO** (`:9000` API, `:9001` console, bucket `si-files`) | Stores exported itinerary PDFs; hands out presigned download URLs | MinIO speaks the **actual S3 API** — the code uses the official `@aws-sdk/client-s3` client, just pointed at MinIO's endpoint. Presigned URLs behave identically | Change the S3 endpoint/region env vars to a real bucket |
| **Message Broker (RabbitMQ)** | **RabbitMQ** (`:5672` AMQP, `:15672` management UI) | Carries `itinerary.created` / `itinerary.shared` / `group.invited` events and the TTL+DLX reminder queues | It is literally the **same product the diagram names** — same topic exchange, same queues. Nothing is simulated | Point `AMQP_URL` at Amazon MQ |
| **API Gateway (×2 instances)** | **Express gateway service** (`:8080`) | The single front door: JWT verification, rate limiting, route table to the services | Same responsibilities, same route table; the ECS config even keeps `desired_count = 2` to mirror the two diagram instances | Same Docker image runs on ECS as-is |
| **Authentication (Amazon Cognito)** | **Dev tokens** today (`POST /api/auth/dev-token`, mock mode); **real Cognito** at T2.2 (Terraform + user pool already planned) | Logs users in; issues the JWT every service verifies | The JWT **contract is identical** — same claims (`sub`, `email`, `name`), same `si_session` cookie, verified with the same `jose` library at the gateway *and* re-verified in every service. Only the token *issuer* differs, switched by `TOKEN_VERIFY_MODE` | `TOKEN_VERIFY_MODE=cognito` + pool env vars (free tier) |
| **Email (SES later)** | **Mailpit** (`:8025` web inbox, `:1025` SMTP) | Delivers confirmation / share / invite / reminder emails somewhere you can actually *see* them | Real SMTP protocol end-to-end; only the final hop differs. Mailpit is a "fake inbox" so demos never email real people | Swap the SMTP adapter for SES (`email-service` adapter pattern) |
| **Route 53 / WAF / ALB, ECS, Secrets Manager** | **Terraform code in `infra/terraform/` — checked in, never applied** | Proves the migration path exists | These are *deployment-time* concerns. Compose on localhost **is** the demo environment; Terraform is the one-command path to AWS when (if) there's a budget | `terraform apply` — deliberately out of scope for a $0 project |

## 2. What actually reaches the internet

Only three things, all optional or free-tier — and the app **degrades honestly**
when they're absent:

1. **Google Gemini** (AI itinerary/weather generation) — free tier. Without an
   API key, gemini-service still boots; its AI endpoints answer a clear 503 and
   nothing else is affected. In mock mode (`NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`,
   used by Cypress) the whole UI runs fully offline with zero keys.
2. **Amadeus** (flight offers) — free **test** environment only. Unreachable?
   The plan facade is designed to return `flightDetails: null` instead of failing.
3. **Amazon Cognito** (from T2.2, your earlier decision) — free tier covers it.

Everything else — profile, itineraries, groups, sharing, PDF export, emails,
all four databases — is 100% local traffic.

## 3. Things that look like a bill but aren't

| What you saw | What it actually is |
|---|---|
| `Estimated Cost: $2450.00` on the profile page (or "$500 - $2000" budgets) | **Sample itinerary/budget data seeded into the local database** (`db/init/*.sql`) — the demo trip "Singapore → Tokyo". It's the app's own domain data, not any service charge. |
| MinIO presigned URLs, `AWS_ACCESS_KEY`-style names | Local MinIO's own credentials for your laptop's bucket — not an AWS account |
| "Cognito", "ECS", "RDS" in code comments | The architecture we're *mirroring*; those code paths run against their local stand-ins until the env vars point at AWS |

## 4. How the AWS swap actually works

The guarantee that makes the free stack safe: **the same Docker images run in
both worlds.** Every difference is environment:

```bash
# Local (compose default)                      # AWS (Terraform sets these)
DATABASE_URL=postgres://smart:smart@auth-db:5432/smart_auth
AMQP_URL=amqp://guest:guest@rabbitmq:5672
S3_ENDPOINT=http://minio:9000
SMTP_HOST=mailpit
TOKEN_VERIFY_MODE=dev
```

Services never import each other — they share only the contracts in
`packages/shared` (zod DTOs + event schemas), which is exactly why the
destination can change without code changes.

## 5. TL;DR for the report

> The system runs the **same microservice architecture as the AWS diagram** —
> gateway, five services, four isolated databases, a RabbitMQ event bus, S3-
> compatible file storage and SMTP email — entirely on localhost for $0, using
> the identical technologies (Postgres, RabbitMQ) or API-compatible equivalents
> (MinIO for S3, Mailpit for SES) wherever a managed AWS product would be
> required. Moving to AWS means changing environment variables (or running the
> checked-in Terraform), not changing code.
