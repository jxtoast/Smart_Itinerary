# Inputs for the ECR module.

variable "project" {
  description = "Name prefix for resource tags."
  type        = string
  default     = "smart-itinerary"
}

variable "service_names" {
  description = "The six backend services (docker-compose.yml names) — one repo each: gateway, auth-service, itinerary-service, gemini-service, tools-service, email-service."
  type        = list(string)
}
