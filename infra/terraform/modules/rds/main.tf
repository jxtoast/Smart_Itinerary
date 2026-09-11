# Four RDS Postgres instances — the AWS counterpart of compose's four
# postgres containers. Diagram: "RDS" (database-per-service).
#
# Each service owns its own database exactly as db/init/*.sql models it:
#   auth-service      → smart_auth
#   itinerary-service → smart_itinerary
#   gemini-service    → smart_gemini
#   tools-service     → smart_tools
# The composed DATABASE_URL per service is emitted in `database_urls` and
# lands in Secrets Manager (modules/secrets) → task definition `secrets`.
#
# Cost-driven choices (README has the estimates):
#   db.t4g.micro, single-AZ, no performance insights, no extra storage — the
#   smallest configuration that behaves like production Postgres.

locals {
  # for_each key = the short name used in outputs; db_name mirrors
  # POSTGRES_DB in docker-compose.yml.
  databases = {
    auth      = { service = "auth-service", db_name = "smart_auth" }
    itinerary = { service = "itinerary-service", db_name = "smart_itinerary" }
    gemini    = { service = "gemini-service", db_name = "smart_gemini" }
    tools     = { service = "tools-service", db_name = "smart_tools" }
  }
}

# One master password per instance, generated at apply time — no credential
# value is ever written in this repo. `special = false` keeps the composed
# DATABASE_URL URL-safe without percent-encoding.
resource "random_password" "master" {
  for_each = local.databases

  length  = 24
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = var.subnet_ids

  tags = { Name = "${var.project}-db" }
}

resource "aws_db_instance" "this" {
  for_each = local.databases

  identifier     = "${var.project}-${each.key}"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  # 20 GiB gp3 = the minimum — plenty for demo seeds.
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true # free (AES-256 on gp3), so why not

  db_name  = each.value.db_name
  username = var.master_username
  password = random_password.master[each.key].result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  publicly_accessible    = false # private IPs only; the services ring reaches them
  multi_az               = false # a second AZ would double the RDS line of the bill

  # Demo-scaffold teardown semantics: no final snapshot (it would outlive the
  # stack and quietly cost storage money), no deletion protection, no backup
  # retention — `terraform destroy` really does return everything to $0.
  backup_retention_period = 0
  skip_final_snapshot     = true
  deletion_protection     = false

  apply_immediately = true

  tags = { Name = "${var.project}-${each.key}" }
}
