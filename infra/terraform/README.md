# Smart Itinerary — AWS scaffold (Terraform, checked in, NEVER applied)

This tree is the AWS half of the re-platform: the whole architecture diagram
expressed as Terraform, mirroring `docker-compose.yml` service-for-service so
the **same Docker images** run in both places with env-var-only changes (the
swap table at the top of `variables.tf` is the map).

> **This stack is not applied and has no state.** The repo's acceptance gate
> is `terraform validate`; nothing here provisions anything by itself. If and
> when a real deployment is wanted, the lead follows this README by hand.

## What exists (module → diagram box)

| Module | Diagram box | AWS resources |
|---|---|---|
| `modules/network` | (implied VPC) | vpc-lite: 1 VPC, public subnets ×2 AZs, IGW, **no NAT**; 3 security groups: ALB → services → DBs |
| `modules/ecr` | "ECR" (CI/CD) | 6 repos, one per service, compose names |
| `modules/ecs` | "API Gateway Instance 1/2" + the 5 service boxes | Fargate cluster, 6 task definitions + services; **gateway `desired_count = 2`** behind the ALB; Cloud Map DNS (compose's hostnames); `/healthz` container health checks; images from ECR |
| `modules/rds` | "RDS" (database-per-service) | 4× `db.t4g.micro` Postgres 16 — `smart_auth`, `smart_itinerary`, `smart_gemini`, `smart_tools` |
| `modules/s3` | "Amazon S3 (File Storage)" | 1 private bucket for PDF exports (the MinIO swap) |
| `modules/secrets` | "AWS Secrets Manager" | `GEMINI_API_KEY`, `AMADEUS_API_KEY`, `JWT_DEV_SECRET` (generated), `AMQP_URL`, SES SMTP creds, 4× `DATABASE_URL` (composed from RDS) |
| `modules/alb` | "Route 53 → WAF → ALB" | Public ALB → gateway target group (`/healthz`); Route53 + WAF + HTTPS listener are count-gated, **default OFF** |
| `modules/cloudwatch` | "CloudWatch" (CI/CD) | 6 log groups (7-day retention), SNS topic, 3 alarm families (no healthy gateway / ALB 5xx / RDS CPU) |
| `modules/cognito` | "Amazon Cognito" | The T2.2 pool, git-moved here unchanged — **exactly one definition in the repo** (was `infra/cognito/`, a standalone stack) |

**Deliberately not here** (documented swaps, manual steps if a deploy happens):

- **The message broker.** Compose's RabbitMQ maps to **Amazon MQ for RabbitMQ**,
  but the broker is not created by this scaffold — you'd create it by hand (or
  a future `modules/mq`) and put its `amqps://…:5671` URL into the `amqp_url`
  tfvars input. The services keep reading `AMQP_URL` either way.
- **SES verification.** `SMTP_HOST`/`SMTP_PORT` are already swapped to the SES
  endpoint; the domain verification + SMTP credentials are SES-console steps.
- **The web app's hosting.** The six backend images are scaffolded; `apps/web`
  (Next.js) would go to Amplify/Vercel/another ECS service — out of scope here.
- **A NAT Gateway** — vpc-lite routes Fargate through public IPs instead
  (ingress still locked by security groups). This saves ~$33/mo.

## Apply order (runbook)

One `terraform apply` walks the dependency graph itself; the stages below are
the manual order to follow if you apply incrementally, and the checklist for
what must exist before the next step makes sense. Prerequisites: an AWS
account, CLI credentials (`aws sts get-caller-identity` prints an ARN),
Terraform ≥ 1.5 (`brew install hashicorp/tap/terraform`), and a
`terraform.tfvars` copied from `terraform.tfvars.example`.

1. **Stage 0 — init**: `terraform -chdir=infra/terraform init` (downloads the
   AWS + random providers; the lock file is committed).
2. **Stage 1 — network, ECR, S3, Cognito** (no dependencies).
   Cognito needs the Google OAuth client first —
   `modules/cognito/RUNBOOK.md` step 1. If you skip Cognito for now:
   `terraform apply -var="enable_cognito=false"`.
3. **Stage 2 — push the images** (before any ECS service can start):
   ```bash
   aws ecr get-login-password --region ap-southeast-1 \
     | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-southeast-1.amazonaws.com
   # per service (gateway, auth-service, itinerary-service, gemini-service,
   # tools-service, email-service) — same build context as docker-compose.yml:
   docker build -f services/<name>/Dockerfile -t <ecr-url>:latest .
   docker push <ecr-url>:latest
   ```
   (`terraform output ecr_repository_urls` lists the six URLs.)
4. **Stage 3 — RDS** (`modules/rds`): instances come up empty —
   `db/init/*.sql` is not applied automatically (RDS has no
   `docker-entrypoint-initdb.d`). Loading it:
   ```bash
   # terraform has no psql; run a one-off Fargate task inside the VPC that does:
   aws ecs run-task --cluster smart-itinerary --launch-type FARGATE \
     --network-configuration 'awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<services-sg>],assignPublicIp=ENABLED}' \
     --task-definition <see below>   # a throwaway task def: image postgres:16,
                                     # command sh -c 'curl -s <sql-url> | psql "$DATABASE_URL"'
   ```
   …where the SQL travels by uploading `db/init/*.sql` to any private URL (or
   baking them into the throwaway image), and `DATABASE_URL` comes from
   Secrets Manager (`terraform output -json database_urls`, or read the
   `*/DATABASE_URL` secrets in the console). Each service's SQL loads into
   **its own** instance — four short runs. The throwaway task definition is
   deleted afterwards; nothing in this scaffold depends on it.
5. **Stage 4 — ALB, ECS, CloudWatch**: `terraform apply` again (or all at once
   in step 2). ECS starts the tasks; the gateway ×2 register into the ALB.
   `terraform output alb_dns_name` is your public URL.
6. **Stage 5 — flip auth (optional)**: with the pool live, set
   `token_verify_mode = "cognito"` in tfvars, re-apply, and add the web env
   vars — the full checklist is `modules/cognito/RUNBOOK.md` step 4. All five
   token-verifying services flip together.
7. **Teardown**: `terraform -chdir=infra/terraform destroy` — buckets/repos
   are `force_delete`, secrets have `recovery_window_in_days = 0`, RDS skips
   final snapshots: the account really returns to **$0**.

## Cost estimate (ROUGH — verify against the AWS Pricing Calculator before applying)

ap-southeast-1, on-demand, running 24/7. Prices drift — treat every number as
±20% and re-check; the point is the *shape* of the bill.

| Component | Sizing | ≈ $/month |
|---|---|---|
| ALB | 1 × ALB + small LCU | ~$22 |
| ECS Fargate | 7 tasks × (0.25 vCPU / 0.5 GB) — gateway ×2 + 5 services | ~$44 |
| RDS | 4 × `db.t4g.micro` + 20 GB gp3 each | ~$58 |
| Secrets Manager | 10 secrets × $0.40 | ~$4 |
| S3 | demo PDFs, negligible GB | ~$0 |
| Cloud Map | 6 service instances | ~$1 |
| CloudWatch | 7-day logs + ~6 alarms | ~$1 |
| ECR | 6 small images | ~$0.50 |
| **Total (always on)** | | **≈ $130–150/mo** |
| Optional: WAF | web ACL + 2 managed rule groups | + ~$8 |
| Optional: Route53 | hosted zone | + ~$0.50 |
| **Cognito** | **free tier** covers a class demo (check the [pricing page](https://aws.amazon.com/cognito/pricing/) before applying — free-tier numbers change) | **$0** |
| NAT Gateway | **$0 — deliberately not provisioned** (vpc-lite) | $0 |

Cheapest realistic demo pattern: `apply` the day before, **`destroy` the day
after** — which is also why every resource above is configured for a clean
teardown. Nothing persists cost after `destroy`.

## Local checks (what CI-level verification means here)

```bash
terraform -chdir=infra/terraform fmt -check -recursive   # formatting
terraform -chdir=infra/terraform init -backend=false     # providers only, no state backend
terraform -chdir=infra/terraform validate                # 0 errors = the acceptance bar
```

`plan`/`apply` are **never** run as part of repo work — they need an AWS
account and cost real money; they are lead-only, by hand, per this README.
