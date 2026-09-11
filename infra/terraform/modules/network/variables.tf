# Inputs for the vpc-lite network module.

variable "project" {
  description = "Name prefix for the VPC, subnets and security groups."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "How many AZs get a public subnet (2 = ALB/ECS minimum for HA)."
  type        = number
  default     = 2
}

variable "gateway_container_port" {
  description = "The gateway's container port — the only port the ALB may reach through the services security group (the ALB fronts no other service)."
  type        = number
  default     = 8080
}
