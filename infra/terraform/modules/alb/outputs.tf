# Values the root module (→ ECS wiring, → CloudWatch alarms, → you) need.

output "alb_dns_name" {
  description = "Public DNS name of the ALB — the stack's URL when Route53 is off."
  value       = aws_lb.main.dns_name
}

output "gateway_target_group_arn" {
  description = "Target group the two gateway tasks register into (modules/ecs)."
  value       = aws_lb_target_group.gateway.arn
}

output "alb_arn_suffix" {
  description = "ALB arn suffix — the LoadBalancer dimension for CloudWatch alarms."
  value       = aws_lb.main.arn_suffix
}

output "target_group_arn_suffix" {
  description = "Target group arn suffix — the TargetGroup dimension for CloudWatch alarms."
  value       = aws_lb_target_group.gateway.arn_suffix
}
