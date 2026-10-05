# Values you paste elsewhere after an apply — mostly the same handoff the
# Cognito RUNBOOK describes: outputs → env vars. `terraform output` after apply.

output "alb_dns_name" {
  description = "Public URL of the stack — point a browser/curl at http://<this>/ (or the Route53 record if enabled)."
  value       = module.alb.alb_dns_name
}

output "ecr_repository_urls" {
  description = "Where to push each service image (README 'Push the images'). Keys = docker-compose service names."
  value       = module.ecr.repository_urls
}

output "service_discovery_namespace" {
  description = "Cloud Map namespace the services resolve each other in (the ECS analogue of compose's service hostnames)."
  value       = module.ecs.discovery_namespace_name
}

output "rds_endpoints" {
  description = "The four database endpoints (auth/itinerary/gemini/tools) — already baked into the DATABASE_URL secrets."
  value       = module.rds.endpoints
}

output "database_urls" {
  description = "The composed DATABASE_URL per service, as stored in Secrets Manager. Sensitive — also readable via the console/CLI."
  value       = module.rds.database_urls
  sensitive   = true
}

output "secret_arns" {
  description = "Secrets Manager ARNs injected into the task definitions (keys like auth-service/DATABASE_URL, gemini/GEMINI_API_KEY)."
  value       = module.secrets.secret_arns
}

output "s3_bucket_name" {
  description = "PDF-exports bucket — already set as tools-service's S3_BUCKET env."
  value       = module.s3.bucket_name
}

# ── Cognito (empty strings when enable_cognito = false) ───────────────────────

output "cognito_issuer" {
  description = "COGNITO_ISSUER for the five token-verifying services (modules/cognito/RUNBOOK.md step 4)."
  value       = local.cognito_issuer
}

output "cognito_web_client_id" {
  description = "COGNITO_CLIENT_ID for those services AND the web app."
  value       = local.cognito_web_client_id
}

output "cognito_hosted_ui_base_url" {
  description = "COGNITO_HOSTED_UI_DOMAIN for apps/web (server-side env, never NEXT_PUBLIC_)."
  value       = local.cognito_hosted_ui_base
}
