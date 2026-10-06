# Root module wiring. Each module maps onto a box of the AWS architecture
# diagram (mapping table in README.md); this file only connects them.
#
# Apply order inside one `terraform apply` is automatic, but the dependency
# layers are worth knowing when reading the wiring (and when applying
# incrementally with -target):
#   1. network / ecr / s3 / cognito — nothing depends on them
#   2. mq                           — needs network's subnets + security groups
#   3. rds                          — needs network's subnets + security groups
#   4. secrets                      — wraps the RDS URLs + the MQ URL composed below
#   5. alb / ecs / cloudwatch       — the runtime that consumes everything above
#   6. cloudfront                   — needs the ALB; the Cognito client update
#                                     (callback URLs) orders after it automatically,
#                                     so ONE apply ends with login working

locals {
  # The six containerized backends from docker-compose.yml plus the web app —
  # the same names are reused for ECR repos, ECS services and log groups, so
  # a compose service name always names its AWS counterpart too.
  service_names = [
    "gateway",
    "auth-service",
    "itinerary-service",
    "gemini-service",
    "tools-service",
    "email-service",
    "web",
  ]

  # The Cognito values the ECS task envs need. `one()` over the splat returns
  # null when enable_cognito = false (the module has count = 0), which
  # coalesce turns into "" — the COGNITO_* env slots simply stay empty and the
  # stack keeps running on dev tokens, compose-style.
  cognito_issuer         = coalesce(one(module.cognito[*].issuer), "")
  cognito_web_client_id  = coalesce(one(module.cognito[*].web_client_id), "")
  cognito_hosted_ui_base = coalesce(one(module.cognito[*].hosted_ui_base_url), "")

  # The message broker: the managed Amazon MQ broker this scaffold creates
  # (modules/mq) when enable_mq is on, otherwise a manually created broker's
  # amqps:// URL via var. Either way it lands in the same
  # broker/AMQP_URL secret the services already read.
  amqp_url = var.enable_mq ? one(module.mq[*].amqp_url) : var.amqp_url

  # The web app's public browser origin. Empty override var = the CloudFront
  # domain (this scaffold's front door — HTTPS, which Cognito's callback
  # rules require). Set var.web_public_url only when serving the web app
  # from somewhere else (e.g. an Amplify/Vercel URL).
  web_public_url = var.web_public_url != "" ? var.web_public_url : "https://${module.cloudfront.domain_name}"

  # Cognito's redirect allowlists: the localhost entries stay (local dev
  # signs in against the same pool) and the CloudFront origin is appended —
  # interpolating the domain here is what makes ONE apply end with login
  # working: Terraform orders the client update after the distribution.
  cognito_callback_urls = concat(var.cognito_callback_urls, ["${local.web_public_url}/auth/callback"])
  cognito_logout_urls   = concat(var.cognito_logout_urls, [local.web_public_url])
}

# ── Layer 1: standalone pieces ────────────────────────────────────────────────

# Diagram: "VPC" (implied by everything living inside it).
module "network" {
  source = "./modules/network"

  project                = var.project
  vpc_cidr               = var.vpc_cidr
  az_count               = var.az_count
  gateway_container_port = 8080 # the ALB's API target (see modules/alb)
  web_container_port     = 3000 # the ALB's default (web) target
}

# Diagram: "ECR" (the CI/CD pipeline's image registry).
module "ecr" {
  source = "./modules/ecr"

  service_names = local.service_names
}

# Diagram: "Amazon S3 (File Storage)" — the MinIO swap target.
module "s3" {
  source = "./modules/s3"

  project = var.project
}

# Diagram: "Amazon Cognito (Auth)" — the T2.2 stack, now a module so the pool
# is defined exactly once in this repo (git-moved from infra/cognito).
module "cognito" {
  source = "./modules/cognito"
  count  = var.enable_cognito ? 1 : 0

  aws_region              = var.aws_region
  hosted_ui_domain_prefix = var.cognito_hosted_ui_domain_prefix
  google_client_id        = var.google_client_id
  google_client_secret    = var.google_client_secret
  callback_urls           = local.cognito_callback_urls
  logout_urls             = local.cognito_logout_urls
}

# ── Layer 2: the broker + the four databases ─────────────────────────────────

# Diagram: "Message Broker (RabbitMQ)" — Amazon MQ for RabbitMQ (modules/mq
# closes the scaffold's former "created by hand" gap).
module "mq" {
  source = "./modules/mq"
  count  = var.enable_mq ? 1 : 0

  project                    = var.project
  vpc_id                     = module.network.vpc_id
  subnet_id                  = module.network.public_subnet_ids[0]
  services_security_group_id = module.network.services_security_group_id
  broker_username            = var.mq_broker_username
  broker_password            = var.mq_broker_password
}

# Diagram: "RDS ×4" (database-per-service).
module "rds" {
  source = "./modules/rds"

  project              = var.project
  subnet_ids           = module.network.public_subnet_ids
  db_security_group_id = module.network.db_security_group_id
  master_username      = var.db_master_username
  instance_class       = var.rds_instance_class
  engine_version       = var.rds_engine_version
}

# ── Layer 3: Secrets Manager (diagram: "AWS Secrets Manager") ────────────────
# DATABASE_URLs are composed here — the only place that sees both the RDS
# endpoints and the generated master passwords — and stored as secrets the ECS
# task definitions inject at container start. The JWT secret is generated
# inside modules/secrets, so no credential value exists in this repo.

module "secrets" {
  source = "./modules/secrets"

  project           = var.project
  environment       = "prod"
  gemini_api_key    = var.gemini_api_key
  amadeus_api_key   = var.amadeus_api_key
  amqp_url          = local.amqp_url
  ses_smtp_username = var.ses_smtp_username
  ses_smtp_password = var.ses_smtp_password

  # The composed RDS URLs, keyed the way the ECS module's secret_refs
  # reference them: "<service>/DATABASE_URL" (modules/rds keys them by the
  # short names auth / itinerary / gemini / tools).
  secret_values = {
    "auth-service/DATABASE_URL"      = module.rds.database_urls["auth"]
    "itinerary-service/DATABASE_URL" = module.rds.database_urls["itinerary"]
    "gemini-service/DATABASE_URL"    = module.rds.database_urls["gemini"]
    "tools-service/DATABASE_URL"     = module.rds.database_urls["tools"]
  }
}

# ── Layer 4: the runtime ──────────────────────────────────────────────────────

# Diagram: "Route 53 → WAF → ALB". Route53 and WAF are count-gated OFF by
# default; the ALB itself always exists and routes /api/* → gateway,
# everything else → web.
module "alb" {
  source = "./modules/alb"

  project                = var.project
  vpc_id                 = module.network.vpc_id
  subnet_ids             = module.network.public_subnet_ids
  alb_security_group_id  = module.network.alb_security_group_id
  gateway_container_port = 8080
  web_container_port     = 3000

  enable_waf          = var.enable_waf
  route53_zone_id     = var.route53_zone_id
  route53_record_name = var.route53_record_name
  acm_certificate_arn = var.acm_certificate_arn
}

# Diagram: "API Gateway Instance 1/2" + the five service boxes + web.
module "ecs" {
  source = "./modules/ecs"

  project                    = var.project
  aws_region                 = var.aws_region
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.public_subnet_ids
  services_security_group_id = module.network.services_security_group_id

  ecr_repo_urls    = module.ecr.repository_urls
  image_tag        = var.image_tag
  container_cpu    = var.container_cpu
  container_memory = var.container_memory
  # 2 gateway tasks behind the ALB = the diagram's two gateway instances.
  gateway_desired_count = var.gateway_desired_count

  # Values the task envs carry, wired so every swap in variables.tf's table
  # lands as a plain env var or a container secret — no image changes.
  secret_arns                  = module.secrets.secret_arns
  pdf_bucket_name              = module.s3.bucket_name
  pdf_bucket_arn               = module.s3.bucket_arn
  token_verify_mode            = var.token_verify_mode
  cognito_issuer               = local.cognito_issuer
  cognito_client_id            = local.cognito_web_client_id
  cognito_hosted_ui_domain     = local.cognito_hosted_ui_base
  web_public_url               = local.web_public_url
  mail_from                    = var.mail_from
  owner_email_fallback         = var.owner_email_fallback
  amadeus_flights_api_base_url = var.amadeus_flights_api_base_url
  gemini_model                 = var.gemini_model
  alb_target_group_arns = {
    gateway = module.alb.gateway_target_group_arn
    web     = module.alb.web_target_group_arn
  }
}

# The HTTPS front door (see modules/cloudfront for why it exists at all).
module "cloudfront" {
  source = "./modules/cloudfront"

  project      = var.project
  alb_dns_name = module.alb.alb_dns_name
}

# Diagram: "CloudWatch" (the CI/CD pipeline's last box + alarms).
module "cloudwatch" {
  source = "./modules/cloudwatch"

  project                  = var.project
  service_names            = local.service_names
  rds_instance_identifiers = module.rds.instance_identifiers
  alb_arn_suffix           = module.alb.alb_arn_suffix
  target_group_arn_suffix  = module.alb.target_group_arn_suffix
  alarm_email              = var.alarm_email
  log_retention_days       = var.log_retention_days
}
