# Outputs consumed by the root module (→ Secrets Manager → task defs) and the
# README's db-init runbook.

output "endpoints" {
  description = "RDS hostname per service key (auth/itinerary/gemini/tools) — port is always 5432."
  value       = { for key, db in aws_db_instance.this : key => db.address }
}

output "database_urls" {
  description = "Composed DATABASE_URL per service — the same variable name the services already read. Sensitive: contains the generated passwords."
  value = {
    for key, db in local.databases :
    key => format(
      # sslmode=require: RDS Postgres 15+ defaults rds.force_ssl=1, and the
      # pg driver (node-postgres ≥8.11) honours the parameter in the URL —
      # so the ECS tasks AND the one-off DDL-loading psql tasks both connect
      # over TLS with zero adapter code.
      "postgres://%s:%s@%s:5432/%s?sslmode=require",
      var.master_username,
      random_password.master[key].result,
      aws_db_instance.this[key].address,
      db.db_name,
    )
  }
  sensitive = true
}

output "instance_identifiers" {
  description = "DB instance identifiers — dimensions for the CloudWatch CPU alarms."
  value       = { for key, db in aws_db_instance.this : key => db.identifier }
}
