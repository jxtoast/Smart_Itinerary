# The public edge — diagram: "Route 53 → WAF → ALB".
#
# The ALB is the only public door. Path-based routing keeps the browser on one
# origin (no CORS, session cookies just work):
#
#   /healthz*  → gateway target group (the API's aggregate health, public so
#                an outside curl can see "all upstreams up")
#   /api/*     → gateway target group (the diagram's "API Gateway Instance
#                1 / Instance 2" — the two gateway tasks behind this group)
#   everything else → web target group (the Next.js app, the "Clients" box)
#
# Listener-rule priorities: healthz(1) before api(2) before the default. The
# target groups' own health checks probe targets DIRECTLY, bypassing these
# rules — so the web app's /healthz and the gateway's /healthz never collide.
#
# Route53 and WAF are the count-gated optional flags of this module, both
# defaulting OFF (they cost extra). TLS is NOT terminated here by default:
# the CloudFront distribution (modules/cloudfront) is the HTTPS front door —
# Cognito refuses non-HTTPS login callbacks for non-localhost origins, and
# without a purchased domain the ALB has no certificate to serve. The
# count-gated HTTPS listener below remains for a domain+ACM setup.
#
# idle_timeout is raised to 120s to match the gateway's own upstream ceiling
# (UPSTREAM_TIMEOUT_MS, services/gateway): an AI plan generation can legally
# take that long, and an ALB that gives up first turns a working request into
# a 504 the browser sees before the gateway's own error.

resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  internal           = false # the front door
  subnets            = var.subnet_ids
  security_groups    = [var.alb_security_group_id]

  idle_timeout               = 120 # see the header comment — matches the gateway's 120s ceiling
  enable_deletion_protection = false

  tags = { Name = "${var.project}-alb" }
}

# Single target group = the gateway. Target type "ip" is what awsvpc-mode
# Fargate tasks register as (each task's ENI IP, across both AZs).
resource "aws_lb_target_group" "gateway" {
  name        = "${var.project}-gateway-tg"
  port        = var.gateway_container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # The gateway answers /healthz 200 when all upstreams are up and 503 when
  # one is "degraded" — the same probe docker-compose healthchecks use.
  health_check {
    path                = "/healthz"
    port                = "traffic-port"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  # Matches the container drain the gateway needs mid-deploy.
  deregistration_delay = 30

  tags = { Name = "${var.project}-gateway-tg" }
}

# The web app's target group — the ALB listener's DEFAULT destination (every
# path that is not the API). Health checks hit the web app's own /healthz
# (apps/web/app/healthz) directly at the target, not through the rules below.
resource "aws_lb_target_group" "web" {
  name        = "${var.project}-web-tg"
  port        = var.web_container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    port                = "traffic-port"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  # Next.js standalone cold start is fast; 30s of drain covers a rolling swap.
  deregistration_delay = 30

  tags = { Name = "${var.project}-web-tg" }
}

# ── Listener rules: /healthz* and /api/* are the gateway's; the rest is web ──

resource "aws_lb_listener_rule" "gateway_healthz" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }

  condition {
    path_pattern {
      values = ["/healthz", "/healthz/*"]
    }
  }
}

resource "aws_lb_listener_rule" "gateway_api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 2

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# Default door: plain HTTP to the web app. Fine for a demo; add a
# certificate for ALB-level HTTPS (CloudFront already provides HTTPS).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# HTTPS exists only when an ACM certificate ARN is provided (request the cert
# in the ACM console first — DNS-validated certs are free). Same routing
# rules as the HTTP listener.
resource "aws_lb_listener" "https" {
  count = var.acm_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# Mirror the HTTP listener's gateway rules onto the HTTPS listener when it
# exists (priorities restart per listener, so 1 and 2 are free there too).
resource "aws_lb_listener_rule" "gateway_healthz_tls" {
  count = var.acm_certificate_arn != "" ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }

  condition {
    path_pattern {
      values = ["/healthz", "/healthz/*"]
    }
  }
}

resource "aws_lb_listener_rule" "gateway_api_tls" {
  count = var.acm_certificate_arn != "" ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 2

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# ── Optional: WAF (the diagram's middle box) — default OFF ───────────────────
# Managed rule groups in COUNT mode: traffic is scored/logged but nothing is
# blocked, so a first demo can't be broken by a false positive. Flip
# override_action to `none {}` (or delete the override) to enforce.

resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.project}-waf"
  scope = "REGIONAL" # REGIONAL = ALB (CLOUDFRONT would be the CDN edge)

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-common-rules"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-bad-inputs"
      sampled_requests_enabled   = false
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = false
  }

  tags = { Name = "${var.project}-waf" }
}

resource "aws_wafv2_web_acl_association" "main" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn
}

# ── Optional: Route53 (the diagram's first box) — default OFF ────────────────
# A friendly name in front of the ALB (e.g. api.example.com → ALB alias).

data "aws_route53_zone" "selected" {
  count = var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
}

resource "aws_route53_record" "api" {
  count = (var.route53_zone_id != "" && var.route53_record_name != "") ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
