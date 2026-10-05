# Inputs for the ALB/edge module.

variable "project" {
  description = "Name prefix for the ALB, target group and WAF."
  type        = string
  default     = "smart-itinerary"
}

variable "vpc_id" {
  description = "VPC the target group lives in (same VPC as the ECS tasks)."
  type        = string
}

variable "subnet_ids" {
  description = "Public subnets the ALB nodes sit in (2 AZs minimum)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "The 'alb' security group (modules/network) — public 80/443 in, services-only out."
  type        = string
}

variable "gateway_container_port" {
  description = "The gateway's container port — the target group's only backend."
  type        = number
  default     = 8080
}

# ── Optional edge pieces (all default OFF — see README cost table) ───────────

variable "enable_waf" {
  description = "Attach a WAF web ACL (managed rules, count-mode) to the ALB."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Hosted zone id for the optional DNS alias record. Empty = skip Route53."
  type        = string
  default     = ""
}

variable "route53_record_name" {
  description = "Record name inside that zone (FQDN, e.g. api.example.com)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate for the HTTPS listener. Empty = HTTP only."
  type        = string
  default     = ""
}
