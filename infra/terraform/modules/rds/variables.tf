# Inputs for the RDS module.

variable "project" {
  description = "Name prefix for the instances and subnet group."
  type        = string
  default     = "smart-itinerary"
}

variable "subnet_ids" {
  description = "Subnets for the DB subnet group (modules/network public subnets — vpc-lite has no private ones; the instances still get private IPs)."
  type        = list(string)
}

variable "db_security_group_id" {
  description = "The 'db' security group (modules/network) — services-only Postgres access."
  type        = string
}

variable "master_username" {
  description = "Master user for all four instances ('smart' mirrors compose's POSTGRES_USER)."
  type        = string
  default     = "smart"
}

variable "instance_class" {
  description = "Instance class — db.t4g.micro is the smallest Graviton general-purpose instance."
  type        = string
  default     = "db.t4g.micro"
}

variable "engine_version" {
  description = "Postgres version (compose runs postgres:16-alpine)."
  type        = string
  default     = "16.4"
}
