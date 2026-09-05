# Values to copy into the service env vars after `terraform apply`
# (RUNBOOK.md step 3 wires these into docker-compose.yml / apps/web/.env).

output "user_pool_id" {
  description = "Cognito user pool id (informational)."
  value       = aws_cognito_user_pool.main.id
}

output "issuer" {
  description = "COGNITO_ISSUER — set on the gateway and every service that verifies JWTs (TOKEN_VERIFY_MODE=cognito)."
  value       = local.issuer
}

output "jwks_url" {
  description = "Where the pool publishes its signing keys (the shared jwt adapter fetches this automatically from the issuer)."
  value       = "${local.issuer}/.well-known/jwks.json"
}

output "web_client_id" {
  description = "COGNITO_CLIENT_ID — set on the gateway/services AND the web app."
  value       = aws_cognito_user_pool_client.web.id
}

output "hosted_ui_base_url" {
  description = "COGNITO_HOSTED_UI_DOMAIN — set on the web app only (server-side env, not NEXT_PUBLIC_)."
  value       = local.hosted_ui_domain
}

output "authorize_endpoint" {
  description = "The endpoint /auth/start redirects to (for curl tests and debugging)."
  value       = "${local.hosted_ui_domain}/oauth2/authorize"
}

output "logout_endpoint" {
  description = "The end-session endpoint /auth/signout redirects to."
  value       = "${local.hosted_ui_domain}/logout"
}
