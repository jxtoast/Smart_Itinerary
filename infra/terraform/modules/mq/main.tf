# Amazon MQ for RabbitMQ — the diagram's "Message Broker (RabbitMQ)" box.
#
# This module closes the one gap the T3.2 scaffold documented ("the broker is
# created by hand"): the broker is now code, like everything else. The
# services keep reading AMQP_URL — only the URL changes, from compose's
# amqp://guest:guest@rabbitmq:5672 to the module's amqps://…:5671 output,
# which flows into the existing broker/AMQP_URL Secrets Manager slot.
#
# Placement: the broker gets a PRIVATE ENI in a public subnet
# (publicly_accessible = false) — the vpc-lite pattern, same as RDS. Fargate
# tasks reach it over the VPC fabric (no NAT needed for in-VPC traffic); the
# internet cannot reach it at all: the security group only admits AMQPS 5671
# from the shared services security group.
#
# TLS: Amazon MQ speaks AMQPS only (5671). The broker adapter passes the URL
# verbatim to amqplib, which switches to TLS on the amqps:// scheme — so this
# is an env-only swap for every publisher/consumer.
#
# Cost: mq.t3.small single-instance ≈ $82/month while up — the most expensive
# single box after RDS. The demo-rhythm answer is terraform destroy (README).

resource "aws_security_group" "broker" {
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

  egress {
    description = "Broker maintenance/delivery callbacks (AWS default posture)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-mq" }
}

resource "aws_mq_broker" "rabbitmq" {
  broker_name        = "${var.project}-rabbitmq"
  engine_type        = "RABBITMQ"
  engine_version     = var.engine_version
  host_instance_type = var.instance_class
  # Private ENI in the public subnet — VPC-reachable, internet-invisible.
  publicly_accessible = false

  # Single-instance: one subnet, one broker node. The TTL+DLX reminder
  # topology is durable, so a broker replacement re-asserts and resumes —
  # HA (MULTI_AZ, ~2x cost) buys nothing a demo-rhythm destroy/apply cycle
  # doesn't already model.
  subnet_ids      = [var.subnet_id]
  security_groups = [aws_security_group.broker.id]

  # The app-level user the AMQP_URL authenticates as. console_access = false:
  # nothing in the stack needs the broker web console.
  user {
    username       = var.broker_username
    password       = var.broker_password
    console_access = false
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
