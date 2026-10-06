# The per-service definition table: ports, and the env vars each task
# definition carries. This is the file to read side-by-side with
# docker-compose.yml — every `environment:` line is here, adjusted only by the
# documented swaps (RDS / S3 / SES / Cognito / Amazon MQ).
#
# Entry conventions:
#   env                — plain environment variables; value null means "compose
#                        had this var, AWS does not need it" and the entry is
#                        dropped (kept visible so the diff to compose is explicit).
#   secret_refs        — env vars whose values ECS injects from Secrets Manager
#                        at container start (name → key in modules/secrets).
#   alb_target_group   — "" = not publicly reachable (backends); "gateway" or
#                        "web" = registers into that ALB target group.
#   register_cloud_map — false for the web app: nothing resolves it by DNS
#                        (browsers reach it via CloudFront → ALB), so a
#                        discovery record would be a dangling name.

locals {
  # The private DNS namespace (compose's flat service network). Services
  # resolve each other as <name>.<namespace>, e.g. the gateway's
  # AUTH_SERVICE_URL mirrors compose's http://auth-service:8081.
  namespace_name = "${var.project}.local"

  # The COGNITO_* env vars: set only when the Cognito module is enabled
  # (empty string otherwise → filtered out). With token_verify_mode = "dev"
  # they sit dormant; flipping the mode is then env-only — the dev-token →
  # Cognito swap of the root variables.tf table.
  cognito_env = [
    { name = "COGNITO_ISSUER", value = var.cognito_issuer == "" ? null : var.cognito_issuer },
    { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id == "" ? null : var.cognito_client_id },
  ]

  # The five JWT-verifying services read TOKEN_VERIFY_MODE (+ the dev secret
  # from Secrets Manager); email-service is broker-only and reads neither.
  auth_mode_env = concat(
    [{ name = "TOKEN_VERIFY_MODE", value = var.token_verify_mode }],
    local.cognito_env,
  )

  services = {
    # ── gateway — diagram: "API Gateway Instance 1/2" ────────────────────────
    # Compose block: services.gateway (no DB/AMQP — it holds no state).
    gateway = {
      port               = 8080
      alb_target_group   = "gateway"
      register_cloud_map = true

      env = concat(
        [
          { name = "SERVICE_NAME", value = "gateway" },
          { name = "PORT", value = "8080" },
          { name = "LOG_LEVEL", value = "info" },
        ],
        local.auth_mode_env,
        [
          # Upstreams: compose's container hostnames become Cloud Map names.
          { name = "AUTH_SERVICE_URL", value = "http://auth-service.${local.namespace_name}:8081" },
          { name = "ITINERARY_SERVICE_URL", value = "http://itinerary-service.${local.namespace_name}:8082" },
          { name = "GEMINI_SERVICE_URL", value = "http://gemini-service.${local.namespace_name}:8083" },
          { name = "TOOLS_SERVICE_URL", value = "http://tools-service.${local.namespace_name}:8084" },
        ],
      )

      secret_refs = {
        # dev mode's HS256 signing secret (cognito mode ignores it) —
        # generated at apply time, never written in this repo.
        JWT_DEV_SECRET = "jwt/JWT_DEV_SECRET"
      }
    }

    # ── auth-service — diagram: "Authentication Service (User Profile)" ─────
    auth-service = {
      port               = 8081
      alb_target_group   = ""
      register_cloud_map = true

      env = concat(
        [
          { name = "SERVICE_NAME", value = "auth-service" },
          { name = "PORT", value = "8081" },
          { name = "LOG_LEVEL", value = "info" },
        ],
        local.auth_mode_env,
      )

      secret_refs = {
        # postgres:smart:smart@auth-db:5432/smart_auth → RDS smart_auth
        DATABASE_URL = "auth-service/DATABASE_URL"
        # amqp://guest:guest@rabbitmq:5672 → Amazon MQ (modules/mq)
        AMQP_URL       = "broker/AMQP_URL"
        JWT_DEV_SECRET = "jwt/JWT_DEV_SECRET"
      }
    }

    # ── itinerary-service — diagram: "Itinerary Service" ────────────────────
    itinerary-service = {
      port               = 8082
      alb_target_group   = ""
      register_cloud_map = true

      env = concat(
        [
          { name = "SERVICE_NAME", value = "itinerary-service" },
          { name = "PORT", value = "8082" },
          { name = "LOG_LEVEL", value = "info" },
        ],
        local.auth_mode_env,
      )

      secret_refs = {
        DATABASE_URL   = "itinerary-service/DATABASE_URL"
        AMQP_URL       = "broker/AMQP_URL"
        JWT_DEV_SECRET = "jwt/JWT_DEV_SECRET"
      }
    }

    # ── gemini-service — diagram: "Gemini Service (Hotel Service)" ──────────
    gemini-service = {
      port               = 8083
      alb_target_group   = ""
      register_cloud_map = true

      env = concat(
        [
          { name = "SERVICE_NAME", value = "gemini-service" },
          { name = "PORT", value = "8083" },
          { name = "LOG_LEVEL", value = "info" },
          # Compose passes the Amadeus host as plain env — still no secret.
          { name = "AMADEUS_FLIGHTS_API_BASE_URL", value = var.amadeus_flights_api_base_url },
        ],
        local.auth_mode_env,
      )

      secret_refs = {
        DATABASE_URL = "gemini-service/DATABASE_URL"
        AMQP_URL     = "broker/AMQP_URL"
        # The AI keys are the canonical Secrets Manager use case (diagram box).
        GEMINI_API_KEY  = "gemini/GEMINI_API_KEY"
        AMADEUS_API_KEY = "gemini/AMADEUS_API_KEY"
        JWT_DEV_SECRET  = "jwt/JWT_DEV_SECRET"
      }
    }

    # ── email-service — diagram: "Email Service" ────────────────────────────
    # Broker-only (no DB): consumes RabbitMQ events, sends over SMTP.
    email-service = {
      port               = 8085
      alb_target_group   = ""
      register_cloud_map = true

      env = [
        { name = "SERVICE_NAME", value = "email-service" },
        { name = "PORT", value = "8085" },
        { name = "LOG_LEVEL", value = "info" },
        # ── Mailpit → SES swap (same vars, SES's SMTP interface) ────────────
        { name = "SMTP_HOST", value = "email-smtp.${var.aws_region}.amazonaws.com" },
        { name = "SMTP_PORT", value = "587" },
        # MAIL_FROM must be a SES-verified identity before any mail sends —
        # SES rejects senders on unverified domains, so this comes from
        # tfvars (empty → entry dropped, compose's dead default applies).
        { name = "MAIL_FROM", value = var.mail_from == "" ? null : "Smart Itinerary <${var.mail_from}>" },
        { name = "OWNER_EMAIL_FALLBACK", value = var.owner_email_fallback == "" ? null : var.owner_email_fallback },
        { name = "WEB_APP_URL", value = var.web_public_url },
      ]

      secret_refs = {
        AMQP_URL = "broker/AMQP_URL"
        # SES relays require auth (Mailpit did not) — the credentials come
        # from Secrets Manager (empty tfvars inputs inject empty values,
        # which the mailer treats as "relay without auth").
        SMTP_USER = "email/SMTP_USERNAME"
        SMTP_PASS = "email/SMTP_PASSWORD"
      }
    }

    # ── tools-service — diagram: "Tools Service (Export PDF, Sharing)" ──────
    tools-service = {
      port               = 8084
      alb_target_group   = ""
      register_cloud_map = true

      env = concat(
        [
          { name = "SERVICE_NAME", value = "tools-service" },
          { name = "PORT", value = "8084" },
          { name = "LOG_LEVEL", value = "info" },
          # ── MinIO → S3 swap ───────────────────────────────────────────────
          # S3_ENDPOINT / S3_PUBLIC_ENDPOINT / S3_ACCESS_KEY_ID /
          # S3_SECRET_ACCESS_KEY are compose-only and deliberately ABSENT:
          # the AWS SDK defaults to real S3, S3 URLs are already public, and
          # the task role (aws_iam_role.task) is the identity.
          { name = "S3_REGION", value = var.aws_region },
          { name = "S3_BUCKET", value = var.pdf_bucket_name }, # compose: si-files
          { name = "S3_FORCE_PATH_STYLE", value = "false" },   # compose: "true" (MinIO)
          { name = "S3_PRESIGN_TTL_SECONDS", value = "3600" },
          # Compose: http://itinerary-service:8082 → Cloud Map name.
          { name = "ITINERARY_SERVICE_URL", value = "http://itinerary-service.${local.namespace_name}:8082" },
          # Share links must resolve in the BROWSER, hence the public origin.
          { name = "WEB_PUBLIC_URL", value = var.web_public_url },
        ],
        local.auth_mode_env,
      )

      secret_refs = {
        DATABASE_URL   = "tools-service/DATABASE_URL"
        AMQP_URL       = "broker/AMQP_URL"
        JWT_DEV_SECRET = "jwt/JWT_DEV_SECRET"
      }
    }

    # ── web — the diagram's "Clients" box, hosted (no compose block) ────────
    # The Next.js app as the 7th ECS service: runs the standalone production
    # build (apps/web/Dockerfile) instead of compose's `next dev`. No DB, no
    # broker, no secrets — it only renders pages, verifies nothing and talks
    # to the gateway either via the ALB's /api/* rule (browser requests) or
    # directly via Cloud Map (its own rewrite fallback).
    web = {
      port               = 3000
      alb_target_group   = "web"
      register_cloud_map = false

      env = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        # Next standalone's server.js binds to process.env.HOSTNAME — and ECS
        # injects the CONTAINER hostname into that variable, which made the
        # server listen on loopback only: the ECS healthcheck (localhost)
        # passed while every ALB check was refused. Bind all interfaces.
        { name = "HOSTNAME", value = "0.0.0.0" },
        # Compose parity: the rewrite target, resolvable via Cloud Map even
        # though ALB path routing handles public /api/* traffic first.
        { name = "API_GATEWAY_URL", value = "http://gateway.${local.namespace_name}:8080" },
        # Server-side sign-in config — the same public-by-design values the
        # five verifying services carry (never NEXT_PUBLIC_).
        { name = "COGNITO_HOSTED_UI_DOMAIN", value = var.cognito_hosted_ui_domain == "" ? null : var.cognito_hosted_ui_domain },
        { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id == "" ? null : var.cognito_client_id },
        # The Cognito redirect/logout URLs and share/email links are built
        # from this origin — behind CloudFront the request Host is an
        # internal ALB DNS name, so the public origin must come from env.
        { name = "WEB_PUBLIC_URL", value = var.web_public_url == "" ? null : var.web_public_url },
      ]

      secret_refs = {}
    }
  }
}
