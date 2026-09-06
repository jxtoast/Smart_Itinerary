# Inputs for the whole AWS scaffold. Defaults mirror docker-compose.yml, so
# the only values you must fill in before an apply are the Google/AI
# credentials and a hosted-UI domain prefix — everything else keeps a
# compose-parity default. Copy terraform.tfvars.example to terraform.tfvars
# (gitignored) and edit there; never commit real values.
#
# ── The $0-local → AWS swap table ─────────────────────────────────────────────
# The scaffold exists so the SAME Docker images (services/*/Dockerfile) that
# run under docker-compose run on ECS with only env-var changes. Each compose
# component maps to a managed AWS equivalent, and the swap is visible in the
# task-definition env of modules/ecs/main.tf:
#
#   docker-compose (local)            →  AWS (this scaffold)                  wired in
#   ───────────────────────              ───────────────────────────────      ─────────
#   postgres ×4 (auth-db, …)          →  RDS db.t4g.micro ×4                  modules/rds
#     DATABASE_URL=…@auth-db:5432/…   →  same var, postgres://…rds:5432/…    Secrets Manager
#                                        (modules/secrets, injected as a
#                                        container `secrets` entry)
#   minio (S3-compatible)             →  S3 bucket (pdf exports)             modules/s3
#     S3_ENDPOINT=http://minio:9000   →  (absent — the AWS SDK defaults to S3)
#     S3_PUBLIC_ENDPOINT=…            →  (absent — S3 URLs are public already)
#     S3_ACCESS_KEY_ID/SECRET=smart   →  (absent — the ECS task role is the identity)
#     S3_FORCE_PATH_STYLE=true        →  "false"
#   mailpit (SMTP catch-all)          →  SES SMTP interface                  modules/ecs env
#     SMTP_HOST=mailpit, SMTP_PORT=1025  email-smtp.<region>.amazonaws.com:587
#   rabbitmq (AMQP)                   →  Amazon MQ for RabbitMQ              Secrets Manager
#     AMQP_URL=amqp://guest:guest@…   →  same var, amqps://<mq-endpoint>:5671
#                                        (broker itself is created by hand —
#                                        see README "What is deliberately not here")
#   dev tokens (mock sign-in)         →  Amazon Cognito                      modules/cognito
#     TOKEN_VERIFY_MODE=dev           →  "cognito" (flip in tfvars)
#     JWT_DEV_SECRET=dev-only-secret  →  COGNITO_ISSUER + COGNITO_CLIENT_ID
#                                        (JWKS verification replaces HS256;
#                                        both env vars are pre-wired here)
#
# Everything is therefore an env-var-only swap — no service code changes.

# ── Naming / placement ────────────────────────────────────────────────────────

variable "project" {
  description = "Name prefix for every resource (buckets, secrets, clusters, DNS namespaces)."
  type        = string
  default     = "smart-itinerary"
}

variable "aws_region" {
  description = "Deployment region. Keep in sync with S3_REGION in packages/shared/.env.example (ap-southeast-1)."
  type        = string
  default     = "ap-southeast-1"
}

# ── Network (modules/network) ─────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR for the vpc-lite VPC. /16 leaves room for everything a demo needs."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of AZs for the public subnets. 2 is the ALB/ECS minimum for HA; more only costs data transfer."
  type        = number
  default     = 2
}

# ── Containers (modules/ecs) ──────────────────────────────────────────────────

variable "image_tag" {
  description = "Tag pulled from the ECR repos for every service. Push images with the README's commands before applying ECS."
  type        = string
  default     = "latest"
}

variable "container_cpu" {
  description = "Fargate vCPU units per task (256 = smallest). Right-size later; smallest keeps the demo cheap."
  type        = string
  default     = "256"
}

variable "container_memory" {
  description = "Fargate memory (MiB) per task (512 = smallest pairing with 256 vCPU)."
  type        = string
  default     = "512"
}

variable "gateway_desired_count" {
  description = "ECS tasks for the gateway. 2 reproduces the diagram's 'API Gateway Instance 1 / Instance 2' behind one ALB."
  type        = number
  default     = 2
}

variable "token_verify_mode" {
  description = "JWT verification mode for the five token-verifying services (packages/shared/src/adapters/jwt.ts). Keep 'dev' for a compose-parity demo; 'cognito' after the pool exists — all five flip together (see modules/cognito/RUNBOOK.md step 4)."
  type        = string
  default     = "dev"
}

variable "web_public_url" {
  description = "Browser origin of the web app — share links (WEB_PUBLIC_URL) and email links (WEB_APP_URL) must resolve in a BROWSER, so this is your public origin, not an internal hostname."
  type        = string
  default     = "http://localhost:3000"
}

# ── Third-party keys (modules/secrets → container secrets) ────────────────────

variable "gemini_api_key" {
  description = "Google Gemini key (server-side only; services/gemini-service). Empty = the endpoints answer 503, exactly like compose without a key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "amadeus_api_key" {
  description = "Amadeus flight-search key (server-side only; services/gemini-service). Empty = flight endpoints answer 503."
  type        = string
  default     = ""
  sensitive   = true
}

variable "amadeus_flights_api_base_url" {
  description = "Amadeus host. The test host mirrors compose; swap to https://api.amadeus.com/v2 in production (not a secret — plain env)."
  type        = string
  default     = "https://test.api.amadeus.com/v2"
}

# ── Message broker swap (see the table above) ─────────────────────────────────

variable "amqp_url" {
  description = "Amazon MQ for RabbitMQ endpoint (amqps://…:5671) with its credentials. The broker itself is NOT created by this scaffold (README 'What is deliberately not here') — create it by hand, or leave empty and accept the email workers idling."
  type        = string
  default     = ""
  sensitive   = true
}

# ── Email swap: Mailpit → SES (see the table above) ───────────────────────────

variable "ses_smtp_username" {
  description = "SES SMTP username. Created in the SES console (they are IAM credentials, so Terraform does not mint them). Empty = omitted from the task env."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ses_smtp_password" {
  description = "SES SMTP password (pairs with ses_smtp_username)."
  type        = string
  default     = ""
  sensitive   = true
}

# ── Databases (modules/rds) ───────────────────────────────────────────────────

variable "db_master_username" {
  description = "Master user for all four RDS instances — 'smart' mirrors POSTGRES_USER in docker-compose.yml. Passwords are generated at apply time (random_password) and only ever live in Secrets Manager/state."
  type        = string
  default     = "smart"
}

variable "rds_instance_class" {
  description = "Smallest general-purpose Graviton instance — the diagram's RDS box ×4, kept at burstable size for demo cost."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_engine_version" {
  description = "Postgres major/minor. Compose runs postgres:16-alpine; pin a version your region offers (README shows how to list them)."
  type        = string
  default     = "16.4"
}

# ── Cognito (modules/cognito) ─────────────────────────────────────────────────

variable "enable_cognito" {
  description = "Create the Cognito pool? Default true (auth = Cognito is a settled project decision). false keeps the stack on dev tokens with empty COGNITO_* env."
  type        = bool
  default     = true
}

variable "cognito_hosted_ui_domain_prefix" {
  description = "Hosted UI domain prefix — sign-in lives at https://<prefix>.auth.<region>.amazoncognito.com. Globally unique across AWS accounts, so use e.g. smart-itinerary-<your-initials>."
  type        = string
  default     = "smart-itinerary-CHANGE-ME"
}

variable "google_client_id" {
  description = "Google Cloud OAuth client id for 'Sign in with Google' federation (modules/cognito/RUNBOOK.md step 1). Free."
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google Cloud OAuth client secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cognito_callback_urls" {
  description = "Origins Cognito may redirect to after sign-in — the web app's /auth/callback route."
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

variable "cognito_logout_urls" {
  description = "Origins Cognito may redirect to after end-session — the web app's home page."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

# ── Optional edge pieces (modules/alb) — all default OFF ──────────────────────

variable "enable_waf" {
  description = "Attach AWS WAF (managed rule groups, count-mode) to the ALB — the diagram's 'WAF' box. Default OFF: managed rules cost extra per month."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id for a friendly DNS name in front of the ALB — the diagram's 'Route 53' box. Default OFF (empty = skip DNS entirely, use the ALB DNS name)."
  type        = string
  default     = ""
}

variable "route53_record_name" {
  description = "Record name inside that zone (e.g. api.example.com). Only used when route53_zone_id is set."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate for an HTTPS listener on the ALB. Empty = HTTP-only (fine for a demo); request the cert in the ACM console first."
  type        = string
  default     = ""
}

# ── Observability (modules/cloudwatch) ────────────────────────────────────────

variable "alarm_email" {
  description = "Email address subscribed to the alarm SNS topic (must confirm the subscription). Empty = the topic exists with no subscriber."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the six service log groups — short on purpose, log storage is the quietest way to run a bill."
  type        = number
  default     = 7
}
