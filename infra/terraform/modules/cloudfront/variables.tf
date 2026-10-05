# Inputs for the CloudFront module.

variable "project" {
  description = "Name prefix for the distribution and its origin id."
  type        = string
  default     = "smart-itinerary"
}

variable "alb_dns_name" {
  description = "The ALB's DNS name (modules/alb) — the distribution's only origin."
  type        = string
}
