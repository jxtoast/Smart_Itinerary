# Smart Itinerary — AWS stack (Terraform, applied by hand — demo rhythm)

This tree is the AWS half of the re-platform: the whole architecture diagram
expressed as Terraform, mirroring `docker-compose.yml` service-for-service so
the **same Docker images** run in both places with env-var-only changes (the
swap table at the top of `variables.tf` is the map).

> **How this runs (the demo rhythm, user-approved 2026-10-05):** the stack is
> applied for real demos and destroyed afterwards — ≈$200/mo while up,
> ≈$1/mo idle. The repo's CI gate stays `terraform validate`; `plan`/`apply`
> are lead-only, by hand, per the runbook below. The Cognito pool (T1.10) is
> already applied and lives in the remote state.

## What exists (module → diagram box)

| Module | Diagram box | AWS resources |
|---|---|---|
| `modules/network` | (implied VPC) | vpc-lite: 1 VPC, public subnets ×2 AZs, IGW, **no NAT**; security groups: ALB → services → DBs (+ the broker's own) |
| `modules/ecr` | "ECR" (CI/CD) | 7 repos — the six services + `web` — compose names |
| `modules/ecs` | "API Gateway Instance 1/2" + the 5 service boxes + web | Fargate cluster, 7 task definitions + services; **gateway `desired_count = 2`** behind the ALB; Cloud Map DNS for the backends (compose's hostnames); `/healthz` container health checks; images from ECR; **auto-scaling** on every service (target-tracking CPU: gateway 2–4, rest 1–3) |
| `modules/mq` | "Message Broker (RabbitMQ)" | Amazon MQ for RabbitMQ, single-instance `mq.t3.small`, private ENI, AMQPS 5671 from the services SG only; emits the `amqps://…:5671` URL into the existing `broker/AMQP_URL` secret |
| `modules/rds` | "RDS" (database-per-service) | 4× `db.t4g.micro` Postgres 16 — `smart_auth`, `smart_itinerary`, `smart_gemini`, `smart_tools`; DATABASE_URLs carry `?sslmode=require` (RDS 15+ forces TLS) |
| `modules/s3` | "Amazon S3 (File Storage)" | 1 private bucket for PDF exports (the local S3-compatible swap) |
| `modules/secrets` | "AWS Secrets Manager" | `GEMINI_API_KEY`, `AMADEUS_API_KEY`, `JWT_DEV_SECRET` (generated), `AMQP_URL` (from modules/mq), SES SMTP creds, 4× `DATABASE_URL` (composed from RDS) |
| `modules/alb` | "Route 53 → WAF → ALB" | Public ALB, path-routed: `/healthz*` + `/api/*` → gateway target group, default → web target group; Route53 + WAF + HTTPS listener are count-gated, **default OFF** (TLS lives at CloudFront) |
| `modules/cloudfront` | *(added edge box)* | HTTPS front door → ALB origin, caching disabled, **origin read timeout 60s (the API's legacy ceiling)** (the AI plan flow legally runs 25–50s). Exists because Cognito refuses non-HTTPS login callbacks for non-localhost origins and the stack has no domain — the default `*.cloudfront.net` certificate is the free fix |
| `modules/cloudwatch` | "CloudWatch" (CI/CD) | 7 log groups (7-day retention), SNS topic, 3 alarm families (no healthy gateway / ALB 5xx / RDS CPU) |
| `modules/cognito` | "Amazon Cognito" | The T2.2 pool — **applied and live** (T1.10). The app client's callback/logout allowlists automatically include the CloudFront origin (root `main.tf` interpolates it) alongside localhost |

**Deliberately still manual** (AWS-console steps the runbook calls out):

- **SES verification + SMTP credentials.** `SMTP_HOST`/`SMTP_PORT` are
  already swapped to the SES endpoint; identity verification and the SMTP
  credential pair are SES-console steps (credentials are IAM-derived, so
  Terraform does not mint them). In the sandbox, recipients must be verified
  too. `mail_from` / `owner_email_fallback` in tfvars must be verified
  identities or every send is rejected.
- **The AWS Budgets alarm** ($10/$50 guardrails — the demo-rhythm safety net).
- **A NAT Gateway** — vpc-lite routes Fargate through public IPs instead
  (ingress still locked by security groups). This saves ~$33/mo.

## Apply order (runbook)

Prerequisites: an AWS account, CLI credentials with admin on this stack
(`aws sts get-caller-identity` prints an ARN), Terraform ≥ 1.10
(`brew install hashicorp/tap/terraform`), Docker running for the image push,
and a `terraform.tfvars` copied from `terraform.tfvars.example`.

1. **Stage 0 — state bucket + init** (once): create the remote state bucket
   (a backend cannot create its own), enable versioning, then put its real
   name into the `backend "s3"` block in `versions.tf` (replacing the
   CHANGE-ME placeholder):
   ```bash
   aws s3api create-bucket --bucket smart-itinerary-tfstate-<suffix> \
     --region ap-southeast-1 --create-bucket-configuration LocationConstraint=ap-southeast-1
   aws s3api put-bucket-versioning --bucket smart-itinerary-tfstate-<suffix> \
     --versioning-configuration Status=Enabled
   terraform -chdir=infra/terraform init -migrate-state   # imports any local state
   ```
   Why remote: the demo rhythm's top hazard is a lost local statefile with
   live resources — orphans nothing can destroy. Versioned + SSE-encrypted S3
   fixes both.
2. **Stage 1 — apply**: `terraform -chdir=infra/terraform apply`. **40–60
   minutes, unattended — do not cancel**: the MQ broker (~15–30 min) and the
   CloudFront distribution (~10–20 min) are the tail. The dependency graph
   handles everything, including updating the Cognito client's callback URLs
   with the new CloudFront domain. `token_verify_mode = "cognito"` in tfvars
   from the start (the pool is live).
3. **Stage 2 — load the DDL** (first apply only): RDS instances come up
   empty — `db/init/*.sql` is not applied automatically (RDS has no
   `docker-entrypoint-initdb.d`). Run the throwaway-task recipe per service:
   ```bash
   # terraform has no psql; run a one-off Fargate task inside the VPC that does:
   aws ecs run-task --cluster smart-itinerary --launch-type FARGATE \
     --network-configuration 'awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<services-sg>],assignPublicIp=ENABLED}' \
     --task-definition <throwaway>   # image postgres:16,
                                     # command sh -c 'curl -s <sql-url> | psql "$DATABASE_URL"'
   ```
   SQL travels by uploading `db/init/*.sql` to any private URL (or baking
   them into the throwaway image); `DATABASE_URL` comes from Secrets Manager
   (`terraform output -json database_urls`). Each service's SQL loads into
   **its own** instance — four short runs; delete the throwaway task def
   afterwards.
4. **Stage 3 — build and push the 7 images**:
   ```bash
   aws ecr get-login-password --region ap-southeast-1 \
     | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-southeast-1.amazonaws.com
   # six backends (same build context as docker-compose.yml):
   docker build -f services/<name>/Dockerfile -t <ecr-url>:latest . && docker push <ecr-url>:latest
   # web:
   docker build -f apps/web/Dockerfile -t <ecr-url>:latest . && docker push <ecr-url>:latest
   ```
   (`terraform output -json ecr_repository_urls` lists all seven.)
5. **Stage 4 — roll the services** (first apply only): the deployment
   circuit breaker trips while images are missing and does NOT self-heal
   once they arrive — force each service explicitly, backends → gateway →
   web, and wait:
   ```bash
   for svc in email-service auth-service itinerary-service gemini-service tools-service gateway web; do
     aws ecs update-service --cluster smart-itinerary --service "$svc" --force-new-deployment
     aws ecs wait services-stable --cluster smart-itinerary --services "$svc"
   done
   ```
6. **Verify**: `terraform output web_public_url` → open it. `curl
   https://<web_public_url>/healthz` is the gateway's aggregate ("all
   upstreams up"); `/` renders the web app; signing in goes through Cognito
   (the callback URL was registered in stage 1).
7. **Teardown**: `terraform -chdir=infra/terraform destroy` — 25–40 minutes
   (the MQ broker deletion is the tail). Buckets/repos are `force_delete`,
   secrets have `recovery_window_in_days = 0`, RDS skips final snapshots:
   the account really returns to ≈$0 (ECR image storage + the state bucket's
   pennies remain). Deployed data is ephemeral by design — the local
   compose stack is the persistent dev environment.

## Cost estimate (ROUGH — verify against the AWS Pricing Calculator before applying)

ap-southeast-1, on-demand, running 24/7. Prices drift — treat every number as
±20% and re-check; the point is the *shape* of the bill.

| Component | Sizing | ≈ $/month |
|---|---|---|
| RDS | 4 × `db.t4g.micro` + 20 GB gp3 each | ~$58 |
| Amazon MQ | 1 × `mq.t3.small` single-instance (smallest this account accepts) | ~$82 |
| ALB | 1 × ALB + small LCU | ~$22 |
| ECS Fargate | 8 tasks × (0.25 vCPU / 0.5 GB) — gateway ×2 + 5 services + web | ~$51 |
| Secrets Manager | 10 secrets × $0.40 | ~$4 |
| S3 | demo PDFs, negligible GB | ~$0 |
| Cloud Map | 6 service instances | ~$1 |
| CloudWatch | 7-day logs + ~6 alarms | ~$1 |
| ECR | 7 small images | ~$0.50 |
| CloudFront | demo traffic (always-free tier covers the first ~1 TB) | ~$0 |
| **Total (always on)** | | **≈ $220–230/mo** |
| Optional: WAF | web ACL + 2 managed rule groups | + ~$8 |
| Optional: Route53 | hosted zone | + ~$0.50 |
| **Cognito** | **free tier** covers a class demo | **$0** |
| NAT Gateway | **$0 — deliberately not provisioned** (vpc-lite) | $0 |

**The demo rhythm is the point:** `apply` the day before a demo, **`destroy`
the day after** — ≈$1–2/day per demo day, ≈$1/mo idle (image storage +
state). Every resource above is configured for a clean teardown, and the
remote state (stage 0) is what makes destroy reliable.

## Local checks (what CI-level verification means here)

```bash
terraform -chdir=infra/terraform fmt -check -recursive   # formatting
terraform -chdir=infra/terraform init -backend=false     # providers only, no state backend
terraform -chdir=infra/terraform validate                # 0 errors = the acceptance bar
```

`plan`/`apply` are **never** run as part of repo work — they need the AWS
credentials and cost real money; they are lead-only, by hand, per this README.
