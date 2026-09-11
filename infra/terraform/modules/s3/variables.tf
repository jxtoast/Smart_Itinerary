# Inputs for the S3 module.

variable "project" {
  description = "Name prefix for the bucket (a random suffix keeps the name globally unique)."
  type        = string
  default     = "smart-itinerary"
}
