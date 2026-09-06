# Values the root module and the runbook need.

output "cluster_name" {
  description = "ECS cluster name — for aws ecs CLI commands in the runbook."
  value       = aws_ecs_cluster.main.name
}

output "discovery_namespace_name" {
  description = "Cloud Map namespace — the in-stack hostname suffix standing in for compose's service names."
  value       = aws_service_discovery_private_dns_namespace.main.name
}
