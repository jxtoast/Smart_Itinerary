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
