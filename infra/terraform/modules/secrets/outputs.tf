# Values the ECS module needs to wire container `secrets` entries.

output "secret_arns" {
  description = "Secret ARN per key (e.g. 'gemini/GEMINI_API_KEY' → its ARN) — valueFrom in the task definitions."
  value       = { for key, secret in aws_secretsmanager_secret.this : key => secret.arn }
}
