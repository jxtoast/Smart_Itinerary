# Inputs for the Amazon MQ module.

variable "project" {
  description = "Name prefix for the broker and its security group."
  type        = string
  default     = "smart-itinerary"
}

variable "vpc_id" {
  description = "VPC the broker's security group lives in."
  type        = string
}

variable "subnet_id" {
  description = "One subnet for the single-instance broker (a modules/network public subnet — the ENI stays private)."
  type        = string
}

variable "services_security_group_id" {
  description = "The shared 'services' security group — the only source allowed to open AMQPS 5671."
  type        = string
}

variable "engine_version" {
  description = "RabbitMQ engine version Amazon MQ should run. Pin the major.minor; minors upgrade automatically."
  type        = string
  default     = "3.13"
}

variable "instance_class" {
  # RabbitMQ on this account runs ONLY on m5/m7g — t3 types are rejected at
  # creation (AWS's error lists the valid set). mq.m7g.medium is the cheapest
  # of them (Graviton).
  description = "Broker instance class (RabbitMQ here accepts only m5/m7g; m7g.medium is the cheapest)."
  type        = string
  default     = "mq.m7g.medium"
}

variable "broker_username" {
  description = "App-level broker user (goes into the amqps:// URL). Keep it alphanumeric — it is URL-composed."
  type        = string
  default     = "smart"
}

variable "broker_password" {
  description = "Broker password (12–128 chars, at least 4 unique — Amazon MQ's rule). Alphanumeric only, same URL-composition reason. Never committed: comes from terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "publicly_accessible" {
  description = "Public ENI for the broker. false (default) = in-VPC only, matching the 'only tasks can reach the broker' segmentation. true = internet-facing; safe only together with console_ingress_cidrs locked to admin /32s. Create-only in Amazon MQ: flipping it REPLACES the broker (~20-30 min)."
  type        = bool
  default     = false
}

variable "console_access" {
  description = "Let the broker user log into the RabbitMQ web console. This only unlocks the account for UI login - network reachability is decided by the security group (console_ingress_cidrs)."
  type        = bool
  default     = false
}

variable "console_ingress_cidrs" {
  description = "CIDRs allowed to reach the console / management API on 443. Keep /32s. Empty (default) = no 443 ingress at all, even if publicly_accessible = true."
  type        = list(string)
  default     = []
}
