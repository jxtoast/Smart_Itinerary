# Values the root module needs: the AMQP_URL for the broker/AMQP_URL secret,
# and human-facing identifiers for the runbook.

locals {
  # Amazon MQ reports endpoints as "amqps://<host>:5671" — strip the scheme
  # so the URL can be recomposed with credentials in the middle.
  endpoint_host = replace(aws_mq_broker.rabbitmq.instances[0].endpoints[0], "amqps://", "")
}

output "amqp_url" {
  description = "amqps://<user>:<pass>@<endpoint>:5671 — the broker/AMQP_URL secret value every publisher/consumer reads."
  value       = "amqps://${var.broker_username}:${var.broker_password}@${local.endpoint_host}"
  sensitive   = true
}

output "endpoint" {
  description = "The broker's AMQPS endpoint (no credentials) — for the README/runbook."
  value       = aws_mq_broker.rabbitmq.instances[0].endpoints[0]
}

output "broker_id" {
  description = "Broker identifier — for console lookups and the destroy checklist."
  value       = aws_mq_broker.rabbitmq.id
}
