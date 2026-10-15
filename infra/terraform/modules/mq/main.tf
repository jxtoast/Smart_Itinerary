# Amazon MQ for RabbitMQ — the diagram's "Message Broker (RabbitMQ)" box.
#
# This module closes the one gap the T3.2 scaffold documented ("the broker is
# created by hand"): the broker is now code, like everything else. The
# services keep reading AMQP_URL — only the URL changes, from compose's
# amqp://guest:guest@rabbitmq:5672 to the module's amqps://…:5671 output,
# which flows into the existing broker/AMQP_URL Secrets Manager slot.
#
# Placement: the broker gets a PRIVATE ENI in a public subnet
# (publicly_accessible = false by default) — the vpc-lite pattern, same as
# RDS. Fargate tasks reach it over the VPC fabric (no NAT needed for in-VPC
# traffic); the internet cannot reach it: the security group only admits
# AMQPS 5671 from the shared services security group. The console opt-in
# (publicly_accessible) exists for a demo-day browser console, but know what
# it really buys (verified live 2026-10-15): a PUBLIC RabbitMQ broker does
# NOT run in this VPC at all — AWS hosts it behind a managed ELB on an
# .on.aws endpoint, refuses custom security groups at create, and leaves
# credentials + TLS as the ONLY gates (443 AND 5671 are internet-open; no IP
# allowlist is possible). The aws_default_security_group block below exists
# only because CreateBroker would otherwise reject the plan shape — it gates
# nothing in public mode. We run private (the default) for this reason.
#
# TLS: Amazon MQ speaks AMQPS only (5671). The broker adapter passes the URL
# verbatim to amqplib, which switches to TLS on the amqps:// scheme — so this
# is an env-only swap for every publisher/consumer.
#
# Cost: mq.m7g.medium single-instance ≈ $65/month while up — the most expensive
# single box after RDS. The demo-rhythm answer is terraform destroy (README).

# Dedicated broker SG — private mode only. AWS does not accept custom
# security groups on PUBLIC RabbitMQ brokers (CreateBroker rejects the pair:
# "Broker with [publiclyAccessible] set to true does not support specifying
# [securityGroups]"); a public broker lands on the VPC's default SG, managed
# below with the same two rules.
resource "aws_security_group" "broker" {
  count = var.publicly_accessible ? 0 : 1

  name_prefix = "${var.project}-mq-"
  vpc_id      = var.vpc_id
  # (Descriptions are ASCII-only — the AWS API rejects other characters.)
  description = "Amazon MQ broker - AMQPS from the ECS services only"

  ingress {
    description     = "AMQPS from the six services (the services ring)"
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = [var.services_security_group_id]
  }

  # RabbitMQ management API — read-only in-VPC tooling (the
  # scripts/broker-queues.py viewer task runs in the services ring). Never
  # internet-reachable: the private broker's only door is the VPC endpoint.
  ingress {
    description     = "Management API 443 from the services ring (queue-viewer task)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.services_security_group_id]
  }

  egress {
    description = "Broker maintenance/delivery callbacks (AWS default posture)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-mq" }
}

# Public mode only: CreateBroker rejects the combination
# (publiclyAccessible=true + securityGroups), so the resource needs SOME sg
# answer; the broker itself is outside this VPC (AWS-managed ELB, .on.aws
# endpoint) and these rules gate nothing real there — the true gates are the
# broker credentials. Managed anyway to keep the default SG explicit, and
# adopted only while publicly_accessible = true (nothing else in this VPC
# uses the default SG).
resource "aws_default_security_group" "public_broker" {
  count = var.publicly_accessible ? 1 : 0

  vpc_id = var.vpc_id

  ingress {
    description     = "AMQPS from the services (data plane - unchanged by console mode)"
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = [var.services_security_group_id]
  }

  dynamic "ingress" {
    for_each = length(var.console_ingress_cidrs) > 0 ? [1] : []
    content {
      description = "RabbitMQ web console / management API (443) - allowlisted admin IPs only"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.console_ingress_cidrs
    }
  }

  egress {
    description = "Broker maintenance/delivery callbacks (AWS default posture)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-mq-public-default-sg" }
}

resource "aws_mq_broker" "rabbitmq" {
  broker_name        = "${var.project}-rabbitmq"
  engine_type        = "RabbitMQ"
  engine_version     = var.engine_version
  host_instance_type = var.instance_class
  # Default private ENI in the public subnet — VPC-reachable,
  # internet-invisible. publicly_accessible is CREATE-ONLY in Amazon MQ:
  # switching it on replaces the broker (~20-30 min) — plan it inside a
  # deploy cycle and pass ALLOW_MQ_REPLACE=1 to deploy-demo.sh once.
  publicly_accessible = var.publicly_accessible

  # Single-instance: one subnet, one broker node. The TTL+DLX reminder
  # topology is durable, so a broker replacement re-asserts and resumes —
  # HA (MULTI_AZ, ~2x cost) buys nothing a demo-rhythm destroy/apply cycle
  # doesn't already model.
  subnet_ids = [var.subnet_id]
  # null (public mode) = omit the field entirely, so AWS attaches the default
  # VPC SG instead of rejecting the create.
  security_groups = var.publicly_accessible ? null : [aws_security_group.broker[0].id]

  # The app-level user the AMQP_URL authenticates as. console_access stays
  # off by default: the data plane never needs the web console; demo-day
  # console access is an explicit tfvars decision (with the 443 /32 rule).
  user {
    username       = var.broker_username
    password       = var.broker_password
    console_access = var.console_access
  }

  # Demo-scaffold semantics: apply-time changes take effect immediately
  # (there is no maintenance window worth waiting for at demo scale).
  apply_immediately = true

  # Required by the RabbitMQ engine (AWS rejects brokers without it).
  auto_minor_version_upgrade = true

  logs {
    # RabbitMQ general logs to CloudWatch — cheap, and the first place to
    # look when a reminder doesn't fire.
    general = true
  }

  tags = { Name = "${var.project}-rabbitmq" }
}
