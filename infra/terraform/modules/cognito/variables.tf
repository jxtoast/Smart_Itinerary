# Inputs for the Cognito stack. Only google_client_* and hosted_ui_domain_prefix
# are required; the defaults match local development (web on localhost:3000).

variable "aws_region" {
  description = "Region for the user pool. Keep in sync with the rest of the deployment (S3_REGION in packages/shared/.env.example)."
  type        = string
  default     = "ap-southeast-1"
}

variable "pool_name" {
  description = "Display name of the Cognito user pool."
  type        = string
  default     = "smart-itinerary-users"
}

variable "hosted_ui_domain_prefix" {
  description = "Hosted UI domain prefix — sign-in pages live at https://<prefix>.auth.<region>.amazoncognito.com. The prefix is globally unique across all AWS accounts, so pick something like smart-itinerary-<your-initials>."
  type        = string
}

variable "google_client_id" {
  description = "OAuth 2.0 client ID from the lead's Google Cloud console (RUNBOOK.md step 1). Free."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "OAuth 2.0 client secret from the Google Cloud console. Goes into terraform.tfvars (gitignored) and is stored by Terraform in the state file — never commit either."
  type        = string
  sensitive   = true
}

variable "callback_urls" {
  description = "Origins Cognito may redirect to after sign-in — the web app's /auth/callback route (apps/web/app/auth/callback/route.ts). Add every origin you serve the web app from."
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

variable "logout_urls" {
  description = "Origins Cognito may redirect to after end-session (/logout) — the web app's home page."
  type        = list(string)
  default     = ["http://localhost:3000"]
}
