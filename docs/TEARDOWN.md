# Smart Itinerary — AWS Teardown & Redeploy Guide

The demo-rhythm runbook: destroy the AWS deployment when it's not needed
(≈$220/mo while up → **≈$1/mo idle**), re-apply it in ~40 minutes for the
next demo. Written after the first live deployment (2026-10-07).

---

## 1. What gets destroyed vs. what survives

| Destroyed (data included) | Survives (free or ≈pennies) |
|---|---|
| 8 Fargate tasks (all services, incl. web) | **The Cognito pool, Google IdP, hosted domain** — $0, all kept. ⚠️ The **OAuth app client is NOT kept**: it is destroyed with the stack (observed 2026-10-09), so *localhost* Cognito sign-in 401s until the next apply recreates it with fresh callbacks — use dev mode locally in between |
| 4× RDS Postgres (**saved itineraries — gone**, by design; `skip_final_snapshot`) | Terraform state bucket (`smart-itinerary-tfstate-terry12321`) — pennies, holds the pool's state |
| Amazon MQ broker (queued messages — gone) | SES verified identities + sandbox (nothing billed) |
| ALB, CloudFront distribution (the URL goes dead) | IAM users/keys (`smart-itinerary-terraform`, `smart-itinerary-ses-sender`) — $0; delete in console if you want max tidiness |
| 7 ECR repos **with images** | The repo itself, its branches, GitHub Actions history |
| S3 PDF bucket (exported PDFs — gone) | The local docker-compose stack — untouched, fully working |
| Secrets Manager (10 secrets incl. DB passwords — regenerated on next apply) | The Cognito **user accounts** (Google logins re-link on next deploy) |
| CloudWatch log groups + alarms, Cloud Map | AWS credits — burn stops the moment the destroy completes |

**Local machine impact:** none. The compose stack and `npm run dev:web` keep
working — the Cognito pool survives, so Google sign-in on `localhost:3000`
still works.

---

## 2. Teardown (≈25–40 minutes, mostly Amazon MQ deletion)

Prerequisites: AWS credentials in `~/.aws/credentials` (region
ap-southeast-1), Terraform ≥ 1.10, and the repo checked out on
`task/aws-prod-migration`.

```bash
cd infra/terraform

# 0. (optional but wise) see exactly what will die:
terraform plan -destroy -no-color | tail -5

# 1. destroy everything EXCEPT the Cognito module (pool + Google IdP + OAuth
#    client + hosted domain — all $0, and the local compose login points at
#    the client):
terraform destroy \
  -target=module.cloudfront \
  -target=module.ecs \
  -target=module.cloudwatch \
  -target=module.alb \
  -target=module.secrets \
  -target=module.rds \
  -target=module.mq \
  -target=module.s3 \
  -target=module.ecr \
  -target=module.network \
  -auto-approve

# 2. watch it go (the MQ broker deletion is the 15–30 min tail):
#    do NOT cancel — a half-deleted MQ broker blocks the next apply
```

### 2.1 Verify you're back to ≈$0

```bash
aws ecs list-services --cluster smart-itinerary --query 'serviceArns'   # fails/empty: cluster gone
aws s3 ls                                                               # only the tfstate bucket remains
# THE SILENT-BILLING TRAP (verified 2026-10-11): AWS can leave an unattached
# Elastic IP behind when the ALB's ENI is deleted. It is NOT Terraform-
# managed, so the destroy will not remove it — and an idle EIP bills
# ~$3.65/month. It must be empty; if a row appears, release it:
aws ec2 describe-addresses --query 'Addresses[?AssociationId==`null`].[AllocationId,PublicIp]' --output table
# aws ec2 release-address --allocation-id <allocationId-from-above>
```

(`teardown-demo.sh` / `teardown-demo.bat` run both checks for you and offer
to release/delete — step 4/5 "cost guard".)

The Billing/Cost-Explorer page keeps showing the month's *historical* spend
for up to ~24 h after the destroy — that is a receipt, not a running meter.
Remaining permanent lines: the state bucket (pennies) and, only if you
declined the cost-guard prompts, an idle EIP / orphaned MQ log groups.

### 2.2 Full teardown variant (also remove the Cognito pool)

Only if you accept re-running the Cognito activation later **and** flipping
the local stack back to dev-token login (delete the three `COGNITO_*` +
`TOKEN_VERIFY_MODE` lines from the root `.env`, then
`docker compose up -d --force-recreate` the five verifying services — see
`infra/terraform/modules/cognito/RUNBOOK.md`):

```bash
terraform destroy -auto-approve     # everything, pool included
```

### 2.3 Troubleshooting

- **"Error: Acquiring state lock" / locked**: a previous run died holding the
  S3 lockfile (it happens when a terminal is killed mid-apply). Confirm no
  terraform process is running, then:
  `aws s3api delete-object --bucket smart-itinerary-tfstate-terry12321 --key prod/terraform.tfstate.tflock`
  and retry. Never delete the lock while an apply is genuinely running.
- **Partial destroy** (cancelled mid-way): just re-run the same destroy
  command — Terraform skips what's already gone.
- **MQ deletion stuck >45 min**: note the broker id, check
  AWS Console → Amazon MQ (console access to ap-southeast-1 may be
  restricted — use the CLI), and re-run the destroy afterwards.

---

## 3. Redeploy for the next demo

**Moved to its own guide: [`docs/REDEPLOY.md`](REDEPLOY.md)** — the full
demo-day redeploy runbook (apply, DDL, images, rollout, verification) with
all the live-tested precautions: the rollout click-window, the per-cycle
CloudFront URL change, the Cognito client-id refresh, the linux/amd64 build
rule, and the psql parameter strip.

Or simply run **`deploy-demo.sh`** (macOS/Linux) / **`deploy-demo.bat`**
(Windows) from the repo root — they execute the entire redeploy with
step-numbered logs, PART 0 checks, failure gates, and the automatic local
`.env` client-id refresh. Partner scripts: `teardown-demo.sh` /
`teardown-demo.bat` (see §2 above).

---

## 4. Cost rules of thumb (ap-southeast-1, on-demand)

| State | ≈ Cost |
|---|---|
| Stack up 24/7 | ≈ $7.40/day (≈ $205–230/mo) — credits absorb it |
| Demo rhythm (up ~1 day/week) | ≈ $8–10/month of credits |
| Destroyed (post cost-guard) | ≈ $0.05/mo — the state bucket only |

The **$10 Budgets alarm** fires at roughly 1.5 days of continuous up-time —
if it emails you, either a demo is still running or something is wrong.

---

## 5. Full shutdown (end of project — return the account to truly $0)

The demo teardown keeps some $0/pennies survivors on purpose (Cognito pool,
SES identities, IAM users, the state bucket). When the project is **done
done** and you want nothing left to bill — ever — run:

```bash
bash final-shutdown.sh     # macOS/Linux
final-shutdown.bat         # Windows
```

It **refuses to run** unless the stack is already destroyed, then walks
through, with a confirmation prompt per step:

| Step | Removes | Was costing |
|---|---|---|
| 1 | unattached Elastic IPs | **~$3.65/mo each — the one real leak** |
| 2 | all CloudWatch log groups (orphaned MQ groups) | pennies |
| 3 | leftover `smart-itinerary-*` task definitions (DDL-loader throwaways) | $0 (tidy) |
| 4 | any leftover ECR repositories with images | pennies |
| 5 | `smart-itinerary` SNS topics + the Cloud Map namespace | pennies/$0 |
| 6 | SES verified identities | $0 |
| 7 | the Cognito pool + hosted domain | $0 — ⚠️ localhost Google sign-in dies forever (dev-token mode still works) |
| 8 | the Terraform state bucket (every version) | pennies — ⚠️ FINAL: nothing can be terraform-restored afterwards (nothing is left running; local compose is unaffected) |
| 9 | **printed, not executed**: the IAM-user deletion commands | $0 |

Step 9 is print-only for a reason: `smart-itinerary-terraform` owns the
access key in `~/.aws/credentials` — deleting that user kills the very
credentials the terminal is using. Run its commands **last**, from another
identity (root / a different admin) or the console. The ultimate option is
Billing → Account → **Close account**; after steps 1–8 there is nothing left
to bill either way.

**Why there is no cheaper "paused" state:** Fargate, RDS, MQ and the ALB all
bill by *existence*, not usage — ECS desired-count 0 still leaves the broker,
databases and load balancer billing. Destroyed-or-running is the only switch,
and destroyed is what `teardown-demo.sh` + the cost guard give you.
