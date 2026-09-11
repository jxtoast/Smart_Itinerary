# Values the other modules need to place their resources in this VPC.

output "vpc_id" {
  description = "The VPC everything lives in."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet ids (2 AZs) — used by the ALB, ECS services and RDS (vpc-lite has no private subnets; see the module header for why)."
  value       = [for subnet in aws_subnet.public : subnet.id]
}

output "alb_security_group_id" {
  description = "Attach to the ALB."
  value       = aws_security_group.alb.id
}

output "services_security_group_id" {
  description = "Attach to every ECS service (they share one flat ring, like compose)."
  value       = aws_security_group.services.id
}

output "db_security_group_id" {
  description = "Attach to every RDS instance."
  value       = aws_security_group.db.id
}
