# Cognito RUNBOOK — create the pool, wire it in, tear it down

Everything needed to move Smart Itinerary from dev tokens to real
**Amazon Cognito** sign-in (the diagram's "Amazon Cognito" box). One-time,
lead-only: the Terraform here is **never applied by CI or docker-compose** —
you run it by hand when you want a real pool. Budget ~10 minutes of active
work plus a couple of minutes of `terraform apply`.

> As of T3.2 this is a **module of the `infra/terraform` root stack**, not a
> standalone directory — apply/destroy commands run against `infra/terraform`.
> **Apply only the Cognito module** (`-target=module.cognito`, step 2): that
> creates the pool alone at $0. Applying the *whole* root stack would also
> build RDS/ALB/ECS (the ~$130–150/mo table in `infra/terraform/README.md`) —
> not what you want for a sign-in demo.

---

## What this creates

| Resource | Purpose | Feeds which env var |
|---|---|---|
| User pool `smart-itinerary-users` | Issues the JWTs every service verifies | — |
| Google identity provider | "Sign in with Google" federation (the app's only sign-in method) | — |
| App client `smart-itinerary-web` (public, **PKCE**) | The web app's OAuth client — no secret, so Cognito enforces PKCE | `COGNITO_CLIENT_ID` |
| Hosted UI domain | The sign-in pages `/auth/start` redirects to | `COGNITO_HOSTED_UI_DOMAIN` |

The web flow that consumes this lives in `apps/web/app/auth/`
(`start` → hosted UI → `callback` → `si_session` cookie → `signout`).
Every service already knows how to verify the resulting JWTs —
`packages/shared/src/adapters/jwt.ts` with `TOKEN_VERIFY_MODE=cognito`.

## Cost: $0

- The user pool free tier comfortably covers a class demo (a handful of
  sign-ins). Google OAuth is free. Nothing here needs a paid tier — **but
  check the [Cognito pricing page](https://aws.amazon.com/cognito/pricing/)
  before applying; AWS free-tier numbers change.**
- MFA is OFF and SMS is not configured, so there is no SNS spend either.
- **Always `terraform destroy` (step 5) after the demo.** A forgotten pool
  costs nothing at rest but it is still a live resource.

## Prerequisites (~2 min if you have an AWS account)

1. **AWS account + CLI credentials**: `aws sts get-caller-identity` prints an
   ARN. If not: `aws configure` with an access key.
2. **Terraform CLI**: `brew tap hashicorp/tap && brew install hashicorp/tap/terraform`
   (any version ≥ 1.5). Check with `terraform version`.
3. **A Google Cloud project** (free) — you need it for step 1.

---

## Step 1 — Google OAuth client (~3 min, free)

1. Go to <https://console.cloud.google.com/apis/credentials> →
   **Create credentials → OAuth client ID → Web application**.
2. Name it `smart-itinerary-cognito`. **Authorized redirect URIs: leave empty
   for now** — you add Cognito's URL in step 3, after the domain exists.
3. Save and copy the **client ID** and **client secret**.
4. If Google asks for a consent screen first: External → app name, your email
   → scopes `openid email profile` → add yourself as a test user. Done.

## Step 2 — create the pool (~2 min of your time, `apply` itself ~2 min)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: Google client id/secret + a globally unique
# hosted_ui_domain_prefix (e.g. smart-itinerary-jt). The other root inputs
# keep their defaults — a pool-only apply needs nothing else.
terraform init                                  # downloads the AWS provider (~1 min, once)
terraform plan -target=module.cognito           # review: exactly 4 resources, nothing else
terraform apply -target=module.cognito          # type yes
```

`-target=module.cognito` is what keeps this $0: only the pool, the Google
IdP, the app client and the hosted-UI domain are created — no RDS, no ALB,
no ECS (that full deployment is `infra/terraform/README.md`'s apply order,
for when there is a real budget).

Note the outputs — `terraform output` after apply; you will paste them in
step 4 (the Cognito ones are surfaced at the root as `cognito_*`):

```
issuer              = https://cognito-idp.<region>.amazonaws.com/<pool-id>
web_client_id       = <26-char id>
hosted_ui_base_url  = https://<prefix>.auth.<region>.amazoncognito.com
```

## Step 3 — let Google redirect to Cognito (~1 min)

Back in the Google Cloud credentials page, edit the OAuth client from step 1
and add this **Authorized redirect URI** (copy the exact value from the
`hosted_ui_base_url` output):

```
https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

Without this, Google shows `redirect_uri_mismatch` at sign-in.

## Step 4 — flip the env vars (~2 min)

No code changes — only env vars. docker-compose already threads the three
service-side variables through every verifying service (defaulting to dev
mode), so the flip is filling two files.

**Root `.env`** (same file as the Gemini keys — Compose loads it):

```bash
TOKEN_VERIFY_MODE=cognito
COGNITO_ISSUER=<issuer output>          # https://cognito-idp.<region>.amazonaws.com/<pool-id>
COGNITO_CLIENT_ID=<web_client_id>       # same value as the web app's, below
```

**Web app** — `apps/web/.env` (server-side only, never `NEXT_PUBLIC_`):

```bash
COGNITO_HOSTED_UI_DOMAIN=<hosted_ui_base_url output>
COGNITO_CLIENT_ID=<web_client_id>
```

> All five verifying services (gateway + auth/itinerary/gemini/tools) read the
> same three root-.env variables and flip **together** by construction. Each
> one re-verifies the JWT with the shared adapter; a mixed fleet would be a
> guaranteed 401. If a service crash-loops after the flip, it is missing
> `COGNITO_ISSUER`/`COGNITO_CLIENT_ID` — `requireEnv` fails fast at boot
> rather than 401-ing every request.

Then recreate the consumers and restart the dev server:

```bash
docker compose up -d --force-recreate gateway auth-service itinerary-service gemini-service tools-service
npm run dev:web    # stop it first — restart picks up apps/web/.env
```

Side effects to know about:

- `POST /api/auth/dev-token` now returns **404** on the gateway (dev-only
  route) and mock auth via `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` still works
  (browser-only, no Cognito involved).
- The web session lasts the id_token TTL (**1 hour**, set on the app client).
  Refresh-token rotation is out of scope on purpose; after an hour the user
  signs in again.

## Step 5 — verify, then tear down

Verify (with the stack running):

1. Open `http://localhost:3000` → Header shows **Sign in with Google**.
2. Click it → hosted UI → Google → back home, Header shows your Google
   name/avatar (profile row upserted by auth-service from the JWT claims).
3. Logout → back home, signed out (cookie cleared + Cognito end-session).

Tear down (**this is what keeps the bill at $0**):

```bash
cd infra/terraform
terraform destroy -target=module.cognito    # type yes — removes the 4 pool resources only
```

Then delete the step-4 lines from the root `.env` and `apps/web/.env`.
Keep `terraform.tfvars` (gitignored) for
the next demo, or delete it and re-do step 1's redirect URI with the new
domain prefix.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Google: `redirect_uri_mismatch` | Step 3 not done, or the domain prefix changed after you added the URI — they must match exactly. |
| Cognito hosted UI: `invalid_client` | `google_client_id`/`secret` in `terraform.tfvars` don't match the Google client. Re-apply. |
| `Requested domain is not available` at apply | `hosted_ui_domain_prefix` is taken globally — pick another, re-apply, and redo step 3. |
| After sign-in the callback page errors with `state mismatch` | The `si_auth_state` cookie was dropped (different browser profile/incognito, or the callback ran on a different origin than `/auth/start`). Retry on the same origin that is listed in `callback_urls`. |
| 401 from `/api/*` right after a successful sign-in | One of the services is still on `TOKEN_VERIFY_MODE=dev` (step 4's box) — all services must flip together. |
| A service crash-loops after the flip (`requireEnv` in the logs) | `TOKEN_VERIFY_MODE=cognito` is set but `COGNITO_ISSUER`/`COGNITO_CLIENT_ID` are missing/empty in the root `.env` — the adapter fails fast at boot instead of 401-ing every request. Fill both, then `docker compose up -d --force-recreate <service>`. |
| Logout: Cognito page says `logout_uri` not allowed | The origin you sign out from is missing from `callback_urls`/`logout_urls` in `variables.tf` defaults → re-apply. |
| Logout: Cognito error page `Required parameters missing` | The app sent a `logout_uri` that doesn't EXACTLY match a whitelisted sign-out URL — Cognito compares strings, so a trailing slash counts (`http://localhost:3000/` ≠ `http://localhost:3000`). Fixed in `apps/web/app/auth/signout/route.ts` (sends the bare origin); if you change `logout_urls`, keep the app's value and the whitelist identical. |
| `npm run dev:web` sign-in 503 page listing missing env | `apps/web/.env` is missing `COGNITO_HOSTED_UI_DOMAIN`/`COGNITO_CLIENT_ID` (step 4). |

## Creating a local test user (optional, no Google needed)

For curl-style testing against the real pool without a browser:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <pool-id output> \
  --username demo@example.com \
  --user-attributes Name=email,Value=demo@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
# then set a password:
aws cognito-idp admin-set-user-password \
  --user-pool-id <pool-id output> --username demo@example.com \
  --password 'ChangeMe123!' --permanent
```

Sign this user in at the hosted UI domain with the email + password (the
hosted UI shows a username/password form alongside Google for pool users).
