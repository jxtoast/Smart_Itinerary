# Inputs for the Secrets Manager module.
# (The JWT dev secret needs no input — it is generated in main.tf.)

variable "project" {
  description = "First segment of every secret name."
  type        = string
  default     = "smart-itinerary"
}

variable "environment" {
  description = "Second segment of every secret name (prod by default — this scaffold is the 'real' deployment)."
  type        = string
  default     = "prod"
}

variable "secret_values" {
  description = <<-EOT
    Extra secrets composed at the root: keys like "broker/AMQP_URL",
    "email/SMTP_USERNAME", values = the secret contents. The root module passes
    the four composed DATABASE_URLs from modules/rds under keys like
    "auth-service/DATABASE_URL".
  EOT
  type        = map(string)
}

variable "gemini_api_key" {
  description = "Google Gemini key → gemini/GEMINI_API_KEY (empty = endpoint 503s, like compose without a key)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "amadeus_api_key" {
  description = "Amadeus key → gemini/AMADEUS_API_KEY."
  type        = string
  default     = ""
  sensitive   = true
}

variable "amqp_url" {
  description = "Amazon MQ (RabbitMQ) endpoint with credentials → broker/AMQP_URL."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ses_smtp_username" {
  description = "SES SMTP username → email/SMTP_USERNAME (optional: SES relays require auth, Mailpit did not)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ses_smtp_password" {
  description = "SES SMTP password → email/SMTP_PASSWORD."
  type        = string
  default     = ""
  sensitive   = true
}
