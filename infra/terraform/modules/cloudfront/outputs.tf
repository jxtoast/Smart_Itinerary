# Values the root module (→ Cognito callbacks, → the web task's public
# origin, → you) need from the distribution.

output "domain_name" {
  description = "The distribution's https://<this> domain — the web app's public origin and the Cognito callback host."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_id" {
  description = "Distribution id — for CLI checks (aws cloudfront get-distribution) and the destroy checklist."
  value       = aws_cloudfront_distribution.main.id
}
