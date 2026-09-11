# Inputs for the CloudWatch module.

variable "project" {
  description = "Name prefix for log groups, alarms and the SNS topic."
  type        = string
  default     = "smart-itinerary"
}

variable "service_names" {
  description = "The six services — one log group each, matching the awslogs config in the task definitions."
  type        = list(string)
}

variable "rds_instance_identifiers" {
  description = "RDS instance ids keyed by service short name — one CPU alarm each."
  type        = map(string)
}

variable "alb_arn_suffix" {
  description = "LoadBalancer dimension for ALB metrics (app/<name>/<id>)."
  type        = string
}

variable "target_group_arn_suffix" {
  description = "TargetGroup dimension for ALB metrics (tg/<name>/<id>)."
  type        = string
}

variable "alarm_email" {
  description = "Email subscribed to the alarm topic (empty = topic only, no subscription)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Log retention — 7 days keeps an idle demo stack's storage cost at pennies."
  type        = number
  default     = 7
}
