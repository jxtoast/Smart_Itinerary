# tools-service (port 8084)

The Tools Service is the **"Tools Service (Export PDF, Sharing)"** box in the
architecture diagram. It is what turns a private trip plan into something you
can hand to other people, in two forms:

- **A PDF file** — `GET /export/itinerary/:id/pdf` fetches the itinerary from
  the itinerary-service, renders it with pdfkit, uploads it to MinIO/S3 and
  returns a time-limited presigned download URL.
- **A share link / group** — groups with email invites (single-use join
  tokens) and share links (`POST /shares`) that publish an `itinerary.shared`
  event so the email-service can notify the audience.

It is a *new* capability — there was no tools code in the monolith to port; the
data model is `db/init/tools-service.sql` (diagram box: **"Amazon RDS (Tools
DB)"**, locally the `tools-db` container). On AWS the same `DATABASE_URL` would
point at an RDS instance and the same S3 adapter code would talk to real S3.

## Request flow (PDF export)

```
Itinerary view (web:3000, T2.5 Export-PDF button)
   │  GET /api/tools/export/itinerary/:id/pdf
   ▼
gateway (:8080)  ── verifies Cognito JWT, forwards /api/tools/* path-intact
   ▼
tools-service (:8084)
   ├─ requireClaims()      re-verifies the token (direct callers too)
   ├─ itineraryClient      GET itinerary-service:8082/api/itineraries/:id
   │                       (caller's own credentials forwarded — the
   │                       itinerary lives in THAT service's database)
   ├─ renderItineraryPdf   pdfkit → in-memory Buffer
   ├─ storage.putObject    → MinIO (S3 API)  bucket si-files
   ├─ recordPdfExport      → pdf_exports audit row (tools-db)
   ├─ presignGetUrl        → time-limited download URL
   ▼
200 { downloadUrl, expiresAt, storageKey }   (browser downloads from MinIO directly)
```

The invite/join flow, for reference:

```
owner ── POST /api/tools/groups/:id/invites ──► group_members row ('invited',
        │                                       single-use invite_token)
        │ group.invited event ──────────────►  email-service: invite email
        ▼
invitee ── POST /api/tools/groups/join { inviteToken } ──► row becomes
        'joined', bound to the invitee's user id, token nulled (single use)
```

## Endpoints

All routes are mounted under **`/api/tools`** and require a valid JWT
(`Authorization: Bearer <token>` or the `si_session` cookie; `TOKEN_VERIFY_MODE`
switches between dev mock tokens and real Cognito). Responses use the shared
zod contracts from `@smart/shared` (`GroupDtoSchema`, `ShareResponseSchema`,
`ExportPdfResponseSchema`, …); validation failures return 400, missing/bad
tokens 401.

| Method | Path | Purpose | Body / Response |
|---|---|---|---|
| POST | `/api/tools/groups` | Create a group (caller becomes owner) | Body `GroupCreateSchema` (`{ name }`) → 201 `GroupDtoSchema` |
| GET | `/api/tools/groups` | Groups the caller owns, joined, or is invited to | → 200 array of `GroupDtoSchema` |
| GET | `/api/tools/groups/:id` | One group with its member list (owner/members/invitees only; others get 404) | → 200 `GroupDtoSchema` |
| POST | `/api/tools/groups/:id/invites` | Owner invites one email → member row + single-use token + `group.invited` event | Body `MemberInviteSchema` (`{ email }`) → 201 refreshed `GroupDtoSchema` · 403 non-owner · 409 already invited/joined |
| POST | `/api/tools/groups/join` | Join with an emailed invite token (token is the authorization, single use) | Body `JoinGroupSchema` (`{ inviteToken }`) → 200 `GroupDtoSchema` · 404 unknown/used token |
| DELETE | `/api/tools/groups/:id` | Owner deletes the group (members cascade; shares keep their tokens with `group_id` NULL) | → 200 `{ message }` · 404 unknown/not owner |
| POST | `/api/tools/shares` | Create a share link for an itinerary; audience = explicit emails ∪ group's joined members; publishes `itinerary.shared` | Body `ShareCreateSchema` → 201 `ShareResponseSchema` (`{ shareToken, shareUrl }`) |
| GET | `/api/tools/shares/:token` | Resolve a share token to the read-only itinerary payload (fetches from itinerary-service) | → 200 `SharedItineraryResponseSchema` · 404 unknown token |
| GET | `/api/tools/export/itinerary/:id/pdf` | Fetch → pdfkit → MinIO → presigned URL (+ `pdf_exports` audit row) | → 200 `ExportPdfResponseSchema` · 404 unknown itinerary · 502 itinerary-service down |

Two demo-grade conventions worth knowing:

- **Invite tokens ride in the group payload.** `GroupDtoSchema.members[]` is
  `passthrough()`, so each member row also carries its `inviteToken`. The
  production path is the emailed link (`group.invited` → email-service); the
  inline token just makes the join flow testable without a mail server.
- **Dev tokens may omit the email claim.** Where an event needs "who did
  this" (`invitedByEmail`, `sharedByEmail`) the service falls back to the
  user id (`sub`) — display-only in the notification.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SERVICE_NAME` | `tools-service` | Name in logs and `/healthz` |
| `PORT` | `8084` | HTTP port |
| `DATABASE_URL` | — | Postgres of this service (`tools-db`/`smart_tools` in compose) |
| `AMQP_URL` | — | RabbitMQ; `group.invited` + `itinerary.shared` published here (best-effort — a broker outage never fails an invite/share) |
| `S3_ENDPOINT` | — (real S3) | MinIO in compose (`http://minio:9000`); unset on AWS |
| `S3_PUBLIC_ENDPOINT` | — (real S3) | Browser-facing endpoint presigned URLs are signed for — compose sets `http://localhost:9000` because the browser cannot resolve the internal `minio` name; unset on AWS (S3 URLs are public) |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_FORCE_PATH_STYLE` | see `packages/shared/.env.example` | storage adapter config |
| `S3_PRESIGN_TTL_SECONDS` | `3600` | Lifetime of the presigned download URL (also reported as `expiresAt`) |
| `ITINERARY_SERVICE_URL` | `http://localhost:8082` | Internal fetch of itinerary aggregates |
| `WEB_PUBLIC_URL` | `http://localhost:3000` | Public web origin; share links are `${WEB_PUBLIC_URL}/shared/<token>` (must be the *browser's* origin, not a compose hostname) |
| `TOKEN_VERIFY_MODE` | `dev` | `dev` = locally-signed mock tokens, `cognito` = real Cognito JWKS |
| `JWT_DEV_SECRET` | `dev-only-secret` | dev-mode signing secret |
| `COGNITO_ISSUER` / `COGNITO_CLIENT_ID` | — | required only in `cognito` mode |
| `LOG_LEVEL` | `info` | pino log level |

See `.env.example` for a copy-pasteable set.

## Offline PDF proof (no infra needed)

`scripts/render-fixture-pdf.ts` runs the exact render pipeline of the export
route against `fixtures/itinerary.json` (a payload in the same shape
itinerary-service GET returns): contract-validate → pdfkit render → structural
PDF assertions, then writes the file to `/tmp` for eyeballing.

```bash
npm run render-fixture-pdf --workspace @smart/tools-service
```

## Diagram mapping

| Diagram box | Where here |
|---|---|
| Tools Service (Export PDF, Sharing) | this Express app (`src/`) |
| Amazon RDS (Tools DB) | `src/repositories/toolsRepository.ts` + `db/init/tools-service.sql` |
| Amazon S3 (File Storage) | `@smart/shared` storage adapter (`src/pdf` + `src/routes/export.routes.ts`); MinIO locally |
| Message Broker (RabbitMQ) | `src/eventPublisher.ts` via the shared broker adapter (`si.events` exchange) |
| Amazon Cognito | JWT verified by `@smart/shared`'s `requireClaims` |

## Run

```bash
# whole stack (recommended — provides tools-db + rabbitmq + minio + itinerary-service):
docker compose up -d --build tools-service

# or bare against the compose infrastructure:
cp services/tools-service/.env.example services/tools-service/.env
npm run dev --workspace @smart/tools-service   # tsx watch on :8084
curl http://localhost:8084/healthz
```

Quick exercise with a dev token (dev mode):

```bash
TOKEN=$(curl -s http://localhost:8080/api/auth/dev-token -H 'content-type: application/json' -d '{}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8084/api/tools/groups
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8084/api/tools/export/itinerary/00000000-0000-0000-0000-000000000001/pdf
```
