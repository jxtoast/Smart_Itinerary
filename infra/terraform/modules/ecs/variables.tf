# Inputs for the ECS module. Everything here arrives from the root module —
# the wiring in ../main.tf shows which module produces what.

variable "project" {
  description = "Name prefix for the cluster, task families, services, roles and the discovery namespace."
  type        = string
  default     = "smart-itinerary"
}

variable "aws_region" {
  description = "Region — needed for the awslogs driver and the SES SMTP hostname."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the Cloud Map private DNS namespace."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets the tasks run in (modules/network public subnets — no NAT in vpc-lite)."
  type        = list(string)
}

variable "services_security_group_id" {
  description = "The shared 'services' security group (compose's flat network, firewalled)."
  type        = string
}

variable "ecr_repo_urls" {
  description = "ECR repository URL per service name (modules/ecr) — the image each task pulls."
  type        = map(string)
}

variable "image_tag" {
  description = "Tag pulled from every repo (default 'latest' — mutable tags for a demo scaffold)."
  type        = string
  default     = "latest"
}

variable "container_cpu" {
  description = "Fargate vCPU units per task (all services same size)."
  type        = string
  default     = "256"
}

variable "container_memory" {
  description = "Fargate memory (MiB) per task."
  type        = string
  default     = "512"
}

variable "gateway_desired_count" {
  description = "Gateway task count — 2 = the diagram's 'API Gateway Instance 1/2'."
  type        = number
  default     = 2
}

variable "gateway_target_group_arn" {
  description = "ALB target group the gateway registers into (modules/alb)."
  type        = string
}

variable "secret_arns" {
  description = "Secrets Manager ARNs keyed like 'auth-service/DATABASE_URL', 'gemini/GEMINI_API_KEY', 'jwt/JWT_DEV_SECRET' (modules/secrets) — valueFrom for the container `secrets` entries."
  type        = map(string)
}

variable "pdf_bucket_name" {
  description = "S3 bucket for PDF exports (modules/s3) — tools-service's S3_BUCKET."
  type        = string
}

variable "pdf_bucket_arn" {
  description = "Same bucket's ARN — the task role's S3 policy scope."
  type        = string
}

variable "token_verify_mode" {
  description = "JWT verification mode for the five token-verifying services (dev | cognito)."
  type        = string
  default     = "dev"
}

variable "cognito_issuer" {
  description = "COGNITO_ISSUER — empty when the Cognito module is disabled (env entry omitted)."
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "COGNITO_CLIENT_ID — empty when the Cognito module is disabled."
  type        = string
  default     = ""
}

variable "web_public_url" {
  description = "Browser origin of the web app — share links (WEB_PUBLIC_URL) and email links (WEB_APP_URL)."
  type        = string
  default     = "http://localhost:3000"
}

variable "amadeus_flights_api_base_url" {
  description = "Amadeus host (plain env in compose too — not a secret)."
  type        = string
  default     = "https://test.api.amadeus.com/v2"
}
