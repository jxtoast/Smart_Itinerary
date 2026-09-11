# vpc-lite network for the Smart Itinerary stack.
#
# Deliberately MINIMAL: one VPC, public subnets only, an Internet Gateway and
# no NAT Gateway. Consequences (each is a cost decision — a NAT Gateway is
# ~$33/month, the single most expensive line of a naive scaffold):
#   - Fargate tasks get PUBLIC IPs (assign_public_ip = true in modules/ecs) so
#     they can pull images/secrets — they are still only reachable on their
#     container ports because the security groups below gate every ingress.
#   - RDS instances sit in the public subnets but with publicly_accessible =
#     false, so they get private IPs only Fargate can route to.
#
# Everything else about the network is standard: two AZs for ALB/ECS HA, and
# three security groups (ALB → services → databases) forming the only
# traffic path: internet → ALB → gateway → service → its database.

# Which AZs exist here — resolved at apply time, sliced to az_count.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # One subnet per AZ; the /8 split carves clean /24s out of the VPC /16.
  azs          = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  subnet_cidrs = { for idx, az in local.azs : az => cidrsubnet(var.vpc_cidr, 8, idx) }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # Cloud Map private DNS (service discovery) needs this

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_subnet" "public" {
  for_each = local.subnet_cidrs

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = each.value
  map_public_ip_on_launch = true # lets Fargate tasks get their public IP

  tags = { Name = "${var.project}-public-${each.key}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-public" }
}

# Everything in the public subnets reaches the internet through the IGW.
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# ── Security groups: the three rings of the traffic path ─────────────────────

# Ring 1 — the ALB itself: accepts browser traffic, talks only to services.
resource "aws_security_group" "alb" {
  name_prefix = "${var.project}-alb-"
  vpc_id      = aws_vpc.main.id
  # (Descriptions are ASCII-only — the AWS API rejects other characters.)
  description = "Public HTTP(S) entry point (diagram: Route 53 -> WAF -> ALB)"

  ingress {
    description = "HTTP from anywhere (HTTPS listener is count-gated in modules/alb)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere (listener only exists when a certificate is set)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "To the services (the services ring below)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-alb" }
}

# Ring 2 — all six services share one group: the ALB may open the gateway's
# container port, and services may talk to EACH OTHER freely (the gateway
# proxies to four upstreams; tools-service calls itinerary-service), which is
# exactly the docker-compose flat network they run in today.
resource "aws_security_group" "services" {
  name_prefix = "${var.project}-services-"
  vpc_id      = aws_vpc.main.id
  description = "The six ECS services (gateway + 5 backends), compose-flat-network style"

  ingress {
    description = "Service -> service (same security group), e.g. gateway -> gemini-service"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  ingress {
    description     = "Browser traffic arrives only via the ALB, and only at the gateway"
    from_port       = var.gateway_container_port
    to_port         = var.gateway_container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Out to sibling services, RDS, Secrets Manager, ECR"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-services" }
}

# Ring 3 — the databases: reachable only from the services ring, only on
# Postgres 5432 (the port compose maps internally too).
resource "aws_security_group" "db" {
  name_prefix = "${var.project}-db-"
  vpc_id      = aws_vpc.main.id
  description = "The four RDS instances - services only, Postgres only"

  ingress {
    description     = "Postgres from the six services"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.services.id]
  }

  tags = { Name = "${var.project}-db" }
}
