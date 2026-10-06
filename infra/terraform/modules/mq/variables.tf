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
  # mq.t3.small: the smallest instance type this account's RabbitMQ engine
  # accepts — mq.t3.micro is rejected at broker creation.
  description = "Broker instance class (mq.t3.small is the smallest the RabbitMQ engine accepts here)."
  type        = string
  default     = "mq.t3.small"
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
