# Values the ECS module (and the README's push commands) need.

output "repository_urls" {
  description = "Full ECR URLs keyed by service name — the '<account>.dkr.ecr.<region>.amazonaws.com/<name>' an image is pushed to."
  value       = { for name, repo in aws_ecr_repository.services : name => repo.repository_url }
}
