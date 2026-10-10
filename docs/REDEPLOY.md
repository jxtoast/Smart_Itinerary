# Smart Itinerary — Redeploy Guide (demo day)

Bring the AWS deployment back for a demo, then tear it down when done.
**Teardown commands live in `docs/TEARDOWN.md`** (§2). This guide covers the
redeploy only.

Total: **≈50–70 minutes** end-to-end (the apply's MQ recreate and the image
builds are the long poles). Cost while up: **≈$0.30/hr**, drawn from credits.

---

## ⚠️ Read first — the three precautions that bite

1. **Do not sign in or click anything while the rollout is running.** During
   step 5 each 1-task service drops to zero for seconds-to-minutes mid-swap —
   logins and clicks in that window fail exactly like an outage (verified
   live 2026-10-09: sign-in attempts during the rollout produced `/me` 500s
   and gemini 502s *even with a perfectly valid token*). The fleet is only
   clickable after every service reports **stable**.
2. **The CloudFront URL changes on every redeploy.** Each apply creates a new
   distribution with a new domain — old links go dark. Always grab the fresh
   one (`terraform output web_public_url`). Cognito's callback list is
   updated automatically (interpolated at apply time), but **localhost
   sign-in needs the new client id** — see step 6.
3. **The Cognito app client does not survive teardowns** — every
   destroy+apply cycle mints a **new client id** (observed: `3bt4r5mo` →
   `1aevb6dh` → `76cpuk`-era → …). Step 6 refreshes the local `.env` files
   automatically; the live services get it through Terraform itself. Never
   create or delete the app client by hand in the Cognito console — that
   causes state drift between AWS and Terraform.

---

## PART 0 — Checks (before every session)

```bash
docker info --format 'up {{.ServerVersion}}'            # Docker Desktop running
aws sts get-caller-identity --query Arn --output text   # → …user/smart-itinerary-terraform
grep region ~/.aws/config                               # → region = ap-southeast-1
```

Notes:
- If Docker just restarted, give the daemon ~30s. If builds fail with socket
  errors, Docker Desktop died — reopen it and wait for the whale to go
  steady. Under a flaky daemon, build **sequentially**, not in parallel.
- The key in `~/.aws/credentials` must belong to the user
  `smart-itinerary-terraform` (AdministratorAccess) in account
  `134580877391`. A pair that passes `sts` but fails ECR/ECS reads is a
  different user's key — the pipeline will fail its preflight.
- **Docker Desktop on this machine has died mid-session before** — if builds
  stall with socket errors, restart Docker Desktop and re-run.

---

## Step 1 — Infrastructure (~20–30 min; the MQ broker recreate is the tail)

```bash
cd infra/terraform
terraform apply -auto-approve -no-color
```

- **Do not cancel** — a half-created MQ broker blocks the next apply.
- ⚠️ Flag order matters: flags **before** any positional argument
  (`terraform apply tfplan -auto-approve` fails with "Too many command line
  arguments" on current Terraform).
- If a plan says the **MQ broker will be replaced**, stop and investigate —
  it should be a no-op/in-place change (the `engine_type` casing in
  `modules/mq/main.tf` is already matched to the provider's stored state).

Verified: `Apply complete! Resources: 119 added, 1 changed, 0 destroyed.`
The Cognito pool + Google IdP are reused (not recreated); the OAuth app
client is recreated with **fresh callbacks pointing at the new CloudFront
domain** — sign-in works on the first try after step 5.

---

## Step 2 — Build and push the 8 images (linux/amd64 — always)

```bash
REGISTRY=134580877391.dkr.ecr.ap-southeast-1.amazonaws.com
ROOT=$(pwd)   # repo root

aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin $REGISTRY

docker build --platform linux/amd64 -f .context/ddl-loader/Dockerfile \
  -t $REGISTRY/tools-service:ddl-loader $ROOT

for svc in gateway auth-service itinerary-service gemini-service \
           tools-service email-service; do
  docker build --platform linux/amd64 -f services/$svc/Dockerfile \
    -t $REGISTRY/$svc:latest $ROOT
done

docker build --platform linux/amd64 -f apps/web/Dockerfile \
  -t $REGISTRY/web:latest $ROOT

for img in tools-service:ddl-loader gateway auth-service itinerary-service \
           gemini-service tools-service email-service web; do
  case $img in *:*) TAG=$img;; *) TAG=$img:latest;; esac
  docker push $REGISTRY/$TAG
done
```

⚠️ **`--platform linux/amd64` is mandatory** — Fargate runs amd64; a
native-Arm (Apple Silicon) build fails at pull time with
`manifest does not contain descriptor matching platform 'linux/amd64'`.

Under a flaky Docker daemon, build **sequentially** — parallel builds have
crashed the daemon mid-run on this machine.

---

## Step 3 — Load the DDL into the 4 databases

The cross-platform helper does everything: stages the 4 task definitions
from **live state** (fresh subnets, security groups, secret ARNs — they
change every cycle; stale ones fail with `InvalidSubnetID.NotFound` /
secret AccessDenied), registers them, runs them, and verifies exit code 0.

```bash
python3 scripts/ddl-stage.py        # macOS/Linux
python scripts/ddl-stage.py         # Windows
```

Each database prints `exit=0` on success. Logs:
CloudWatch → `/ecs/smart-itinerary/tools-service`, stream prefix `ddl`.

⚠️ The psql command inside **strips the node-only `uselibpqcompat=true`**
query parameter and re-appends a clean `?sslmode=require` — real libpq
`psql` rejects the node-only parameter. Don't remove that stripping.

---

## Step 4 — Roll the services onto the images

```bash
for svc in email-service auth-service itinerary-service gemini-service \
           tools-service gateway web; do
  aws ecs update-service --cluster smart-itinerary --service $svc \
    --force-new-deployment >/dev/null
  aws ecs wait services-stable --cluster smart-itinerary --services $svc \
    && echo "$svc stable"
done
```

⚠️ **Gate all sign-ins and clicks on this step completing.** See
precaution 1 — the whole fleet is only clickable after the last `stable`.

---

## Step 5 — Verify

```bash
DOMAIN=$(aws cloudfront list-distributions --region ap-southeast-1 \
  --query 'DistributionList.Items[0].DomainName' --output text)
echo "URL: https://$DOMAIN"

curl -s -o /dev/null -w "homepage: HTTP %{http_code} (%{time_total}s)\n" \
  --max-time 25 "https://$DOMAIN/"

curl -s --max-time 15 "https://$DOMAIN/healthz" | python3 -m json.tool
# expect: "status": "ok" and all four upstreams "up"

curl -s -o /dev/null -w "sign-in: HTTP %{http_code}\n" \
  --max-time 15 "https://$DOMAIN/auth/start"
# expect: 307 (redirect to the Cognito hosted UI)
```

**Then the demo path**: sign in with Google → generate a **2-day trip**
(flash-lite is the fast model — `GEMINI_MODEL` is pinned in tfvars) →
**Save** (confirmation email arrives) → **Export PDF** → **Share** to a
verified Gmail address (share email + working read-only link). The save
also schedules a reminder — with a trip start ≤24h away it arrives in
~30 seconds via the MQ TTL→dead-letter chain.

---

## Teardown when done

See `docs/TEARDOWN.md` §2 — the targeted destroy (Cognito module spared),
≈25–40 min, returns the account to ≈$1/mo idle.
