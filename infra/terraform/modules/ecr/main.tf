# ECR image registry — one repository per backend service (6 total).
# Diagram: the "ECR" box in the CI/CD pipeline (GitHub Actions pushes here,
# ECS pulls from here). Repos carry the docker-compose service names so a
# pushed image's destination is never ambiguous.

resource "aws_ecr_repository" "services" {
  for_each = toset(var.service_names)

  name = each.key

  # "latest" is re-pushed per deploy for a demo scaffold; mutable tags keep
  # the ECS image reference stable (image_tag variable defaults to "latest").
  image_tag_mutability = "MUTABLE"

  # Basic scanning is free and catches the obvious CVEs on every push.
  image_scanning_configuration {
    scan_on_push = true
  }

  # `terraform destroy` removes repos WITH images — without this a demo
  # teardown would refuse until every repo was emptied by hand.
  force_delete = true

  tags = { Name = "${var.project}-${each.key}" }
}
