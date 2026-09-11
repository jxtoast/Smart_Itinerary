# ECS Fargate — the diagram's service boxes, containerized exactly as they
# run under docker-compose.yml.
#
#   ECS cluster      = the compose project
#   task definition  = one compose service block (env mirrors it 1:1; see the
#                      swap comments in `locals.services` and the big swap
#                      table in ../../variables.tf)
#   ECS service      = the always-running instance(s) of that task — the
#                      gateway runs desired_count = 2, which IS the diagram's
#                      "API Gateway Instance 1 / Instance 2" behind the ALB
#   Cloud Map (DNS)  = compose's service hostnames: the gateway's upstream
#                      URL `http://auth-service:8081` becomes
#                      `http://auth-service.<namespace>:8081`
#
# Everything the services read from the environment keeps its name — the only
# differences from compose are the swap targets (RDS URLs from Secrets
# Manager, real S3, SES SMTP, optional Cognito), which is the point: same
# images, env-var-only changes.

# ── Roles ─────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# EXECUTION role: what ECS itself uses to pull the image and inject container
# secrets on task start. AmazonECSTaskExecutionRolePolicy covers ECR + awslogs;
# the inline policy adds read access to exactly the secrets this stack owns.
resource "aws_iam_role" "execution" {
  name               = "${var.project}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.tasks_assume.json

  tags = { Name = "${var.project}-ecs-execution" }
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadStackSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(var.secret_arns)
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "secret-injection"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# TASK role: what the CONTAINER runs as. Only tools-service's S3 writes need
# runtime AWS permissions — the SDK picks this role up automatically, which is
# why S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY vanish from its env on AWS.
resource "aws_iam_role" "task" {
  name               = "${var.project}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.tasks_assume.json

  tags = { Name = "${var.project}-ecs-task" }
}

data "aws_iam_policy_document" "task_s3" {
  statement {
    sid       = "PdfExports"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.pdf_bucket_arn}/*"]
  }

  statement {
    sid       = "ListPdfExports"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.pdf_bucket_arn]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  name   = "pdf-exports"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

# ── Cluster + service discovery ───────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = var.project

  # Container Insights costs per metric — off for a demo scaffold.
  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = { Name = var.project }
}

# Private DNS namespace = compose's implicit service network. `auth-service`
# inside the stack resolves like `auth-service` does in docker-compose.
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = local.namespace_name
  vpc         = var.vpc_id
  description = "Service hostnames for the six backends (the compose hostname analogue)"
}

# ── Task definitions: one per service, env mirroring docker-compose ──────────

resource "aws_ecs_task_definition" "services" {
  for_each = local.services

  family                   = "${var.project}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc" # each task gets its own ENI (compose: its own container)
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${var.ecr_repo_urls[each.key]}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = each.value.port
          protocol      = "tcp"
        },
      ]

      # Plain env — the compose `environment:` block, swap-adjusted.
      environment = [
        for entry in each.value.env : { name = entry.name, value = entry.value }
        if entry.value != null # null = "not applicable on AWS" (e.g. S3_ENDPOINT)
      ]

      # Secret env — injected by ECS at start from Secrets Manager using the
      # EXECUTION role (valueFrom = secret ARN from modules/secrets).
      secrets = [
        for env_name, secret_key in each.value.secret_refs : {
          name      = env_name
          valueFrom = var.secret_arns[secret_key]
        }
      ]

      # Same probe the compose healthchecks run (busybox wget is in every
      # image because compose already required it for its healthchecks).
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:${each.value.port}/healthz || exit 1"]
        interval    = 10
        timeout     = 3
        retries     = 5
        startPeriod = 30 # node/npm boot headroom before failures count
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.project}/${each.key}" # modules/cloudwatch
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = each.key
        }
      }
    },
  ])

  tags = { Name = "${var.project}-${each.key}" }
}

# ── Services: keep `desired_count` tasks running ─────────────────────────────

resource "aws_service_discovery_service" "services" {
  for_each = local.services

  name = each.key # the DNS label — compose's hostname

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10 # short TTL so a replaced task is found quickly
      type = "A"
    }

    # MULTIVALUE = every task's IP is returned (round-robin), like compose's
    # DNS aliasing of a scaled service.
    routing_policy = "MULTIVALUE"
  }

  # Defer to the container health check above (no extra Cloud Map probes).
  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_ecs_service" "services" {
  for_each = local.services

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.services[each.key].arn

  # The gateway ×2 = the diagram's "API Gateway Instance 1 / Instance 2";
  # every other service is a single task for demo cost.
  desired_count = each.key == "gateway" ? var.gateway_desired_count : 1
  launch_type   = "FARGATE"

  # vpc-lite has no NAT gateway, so tasks pull images/secrets over a public
  # IP (ingress is still locked down by the security groups).
  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.services_security_group_id]
    assign_public_ip = true
  }

  # The gateway joins the ALB's target group; no other service is public.
  dynamic "load_balancer" {
    for_each = each.value.attach_alb ? [1] : []

    content {
      target_group_arn = var.gateway_target_group_arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  # Register in Cloud Map so sibling services resolve the compose-style name.
  service_registries {
    registry_arn = aws_service_discovery_service.services[each.key].arn
  }

  # Give the container's own health check time to settle before the ALB
  # starts probing (only meaningful for the ALB-attached gateway).
  health_check_grace_period_seconds = 30

  # Demo deployment ergonomics: roll tasks one at a time and let the circuit
  # breaker undo a bad deploy instead of leaving a service half-deployed.
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0 # lets a 1-task service redeploy at all

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = { Name = "${var.project}-${each.key}" }

  depends_on = [aws_iam_role_policy.execution_secrets]
}
