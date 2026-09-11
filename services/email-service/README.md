# email-service (port 8085)

The Email Service turns **RabbitMQ events into emails**: trip confirmations,
share notifications, group invitations and the 24h-before-start trip reminder.
It is the only service with **no database** (AMQP-only) — every message it
needs is already in the queue, so nothing is persisted.

This is the **"Email Service"** box in the architecture diagram, fed by the
**"Message Broker (RabbitMQ)"**. Locally mail goes to the `mailpit` container
(UI on http://localhost:8025); on AWS the same SMTP env vars point at Amazon
SES's SMTP interface — `@smart/shared`'s mailer adapter does the swap.

## How a reminder works (TTL + dead-lettering)

Reminders need "wake me up in N hours" without a scheduler process. RabbitMQ
does it natively: a message with a per-message **TTL** parked on a queue
**dead-letters** (is re-routed) when the TTL expires.

```
itinerary-service  ── itinerary.created ──▶  si.events (topic exchange)
                                                │
        ┌───────────────────────────────────────┤
        ▼                                       │
  email.events                          reminders.waiting (TTL = delay
        │  consumed here                │  until 24h before trip start)
        ▼                               │
  confirmation email                    │ TTL expires → dead-letter
  + scheduleReminder() ─────────────────┘   (x-dead-letter-exchange/routing-key)
                                        ▼
                          si.events ◀── email.reminder.due
                              │
                              ▼
                        reminders.due (consumed here) → reminder email
```

The topology (queue names, bindings, DLX arguments, delay math) lives in
`packages/shared/src/adapters/broker.ts` + `src/events.ts` — this service only
consumes the two queues and publishes through the adapter.

## Events consumed

| Queue | Routing key | Email sent |
|---|---|---|
| `email.events` | `itinerary.created` | Confirmation to the trip owner + reminder scheduled |
| `email.events` | `itinerary.shared` | One read-only share link per recipient |
| `email.events` | `group.invited` | Group invitation with join token |
| `reminders.due` | `email.reminder.due` | "Your trip starts soon" reminder to the owner |

Delivery is **at-least-once** (ack after the handler succeeds): a crash between
send and ack can duplicate an email. A malformed event is retried once, then
dropped as poison — one bad publisher can't wedge the queue. Unknown routing
keys are logged and acked unprocessed.

## What happens when RabbitMQ restarts

Nothing needs a container restart. The shared broker adapter
(`packages/shared/src/adapters/broker.ts`) supervises the connection:

```
rabbitmq restarts ─▶ adapter notices (connection 'error'/'close')
                         │ status → "retrying"  (mirrored into /healthz)
                         ▼
              reconnect with bounded backoff (1s → 2s → 4s … capped 30s)
                         │ on success: re-assert exchange/queues/bindings,
                         │             replay every registered consumer
                         ▼
                  status → "connected", events flow again
```

During the outage window publishes fail soft (callers log and drop — events
are best-effort notifications, nothing is buffered); messages acked before the
drop are gone, unacked ones are redelivered by RabbitMQ after reconnect. The
retry loop in `src/index.ts` only covers the *first* connect (createBroker
throws while RabbitMQ is absent at boot).

## Endpoints

HTTP exists only for liveness — all real work is consumer-driven.

| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/healthz` | Compose healthcheck; body reports broker state | `{ status, service, broker: "connecting"\|"connected"\|"retrying" }` |

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SERVICE_NAME` | `email-service` | Name in logs and `/healthz` |
| `PORT` | `8085` | HTTP port (health endpoint only) |
| `AMQP_URL` | — | RabbitMQ — the only dependency |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Mailpit in compose; SES SMTP on AWS |
| `SMTP_USER` / `SMTP_PASS` | — | Only when the relay requires auth |
| `MAIL_FROM` | `Smart Itinerary <no-reply@smart-itinerary.local>` | From-header on every email |
| `MAILER_DRY_RUN` | `false` | `true` = log instead of sending (no SMTP needed) |
| `OWNER_EMAIL_FALLBACK` | `owner@smart-itinerary.local` | See "Known contract gap" below |
| `WEB_APP_URL` | `http://localhost:3000` | Base URL for share / join links in emails |
| `LOG_LEVEL` | `info` | pino log level |

See `.env.example` for a copy-pasteable set.

## Diagram mapping

| Diagram box | Where here |
|---|---|
| Email Service | this Express app + consumers (`src/`) |
| Message Broker (RabbitMQ) | consumed via `@smart/shared`'s broker adapter (`si.events`, TTL+DLX queues) |
| (AWS) Amazon SES | `createMailer()` in `@smart/shared` — same code, SES SMTP env vars |

## Run + demo the flow

```bash
# whole stack (recommended — provides rabbitmq + mailpit):
docker compose up -d --build email-service

# or bare against the compose infrastructure:
cp services/email-service/.env.example services/email-service/.env
npm run dev --workspace @smart/email-service   # tsx watch on :8085
curl http://localhost:8085/healthz

# fire demo events at RabbitMQ without itinerary-service/tools-service:
npm run publish-test-event --workspace @smart/email-service
#   → Mailpit (http://localhost:8025): confirmation now, reminder ~30s later
#   variants: npx tsx scripts/publish-test-event.ts [created|shared|invited] [--start 2026-10-01]
```

## Owner email on `itinerary.created` (resolved in T1.7)

`ItineraryCreatedEvent` (and therefore `ReminderDueEvent`) now carries an
optional `ownerEmail` in the shared schema, and itinerary-service fills it
from the verified JWT claims when saving. This service reads that field with
no change to its handler, and still falls back to `OWNER_EMAIL_FALLBACK`
when a token carried no email claim (dev/mock tokens can omit it) — the
fallback is the claimless-token safety net, no longer the default address.
