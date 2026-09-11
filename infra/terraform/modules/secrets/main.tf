# Secrets Manager — the diagram's "AWS Secrets Manager" box.
#
# One secret per env var that must never sit in a task definition's plaintext
# `environment` block. ECS injects them into the container at start via the
# task definition's `secrets` entries (modules/ecs), so the services keep
# reading the exact same variable names they read under compose.
#
# Secret naming: <project>/<environment>/<name-with-slashes>, e.g.
#   smart-itinerary/prod/auth-service/DATABASE_URL
#   smart-itinerary/prod/gemini/GEMINI_API_KEY
#
# The JWT dev secret is GENERATED here (random_password), so this repo never
# contains a credential value; everything else arrives as a (possibly empty)
# tfvars input the operator fills in.

resource "random_password" "jwt_dev_secret" {
  length  = 32
  special = false
}

locals {
  # The full name → value map. Keys are referenced by the ECS module's
  # secret_refs (e.g. "auth-service/DATABASE_URL"), so renaming a key here
  # means renaming it there too.
  values = merge(
    var.secret_values,
    {
      # Generated at apply time — the dev-mode signing secret (unused once
      # TOKEN_VERIFY_MODE=cognito, harmless until then).
      "jwt/JWT_DEV_SECRET" = random_password.jwt_dev_secret.result

      # The diagram's Secrets Manager box, verbatim: third-party AI keys.
      "gemini/GEMINI_API_KEY"  = var.gemini_api_key
      "gemini/AMADEUS_API_KEY" = var.amadeus_api_key

      # Amazon MQ endpoint (broker created by hand — see ../../README.md).
      "broker/AMQP_URL" = var.amqp_url

      # SES SMTP credentials (empty until the operator creates them in the
      # SES console; email-service treats empty as "no SMTP auth").
      "email/SMTP_USERNAME" = var.ses_smtp_username
      "email/SMTP_PASSWORD" = var.ses_smtp_password
    },
  )
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.values

  name        = "${var.project}/${var.environment}/${each.key}"
  description = "Smart Itinerary: injected as env var '${element(reverse(split("/", each.key)), 0)}' into the task definition that references it"

  # Default recovery is a 30-day soft delete, which blocks re-creating a
  # secret of the same name during demo teardown/re-apply cycles. 0 = really
  # gone on destroy, which is what "$0 after destroy" requires.
  recovery_window_in_days = 0

  tags = { Name = "${var.project}-${each.key}" }
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = local.values

  secret_id = aws_secretsmanager_secret.this[each.key].id

  # An empty string is fine — e.g. no Gemini key configured: the service
  # boots and the affected endpoints answer 503, same as compose without a key.
  secret_string = each.value
}
