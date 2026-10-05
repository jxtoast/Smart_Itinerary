# CloudFront — the HTTPS front door (an ADDED edge box, not a diagram
# substitution: the request path is CloudFront → ALB → gateway/web).
#
# Why it exists at all: Cognito refuses non-HTTPS login callbacks for any
# non-localhost origin, and this stack has no purchased domain — so there is
# no way to serve HTTPS from the ALB alone (its TLS listener needs an ACM
# certificate tied to a domain). CloudFront's DEFAULT domain
# (https://d<id>.cloudfront.net) is a real certificate for free, which also
# makes the web session cookie's Secure flag work. If a domain is ever
# bought, add an alias + ACM cert here (or flip the ALB's count-gated HTTPS
# listener) — nothing else changes.
#
# Behaviour: pure pass-through. Every path is forwarded to the ALB, which
# does the /api/* vs default routing — the browser stays on ONE origin, so
# session cookies ride along and no CORS exists anywhere. Caching is
# DISABLED for everything (both routes are dynamic: API responses and
# server-rendered pages; a cached /api answer would be a correctness bug).
#
# Timeouts: origin_read_timeout is raised to 180s (default 30s) — the
# gateway legally holds an AI plan request for up to 120s (its
# UPSTREAM_TIMEOUT_MS ceiling, mirrored by the ALB idle_timeout), and a CDN
# that gives up at 30s would kill exactly the marquee feature.

# AWS-managed policies, referenced by name so no well-known-ID is hardcoded.
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  comment         = "${var.project} HTTPS front door (Cognito requires https login callbacks)"
  http_version    = "http2and3"
  is_ipv6_enabled = true

  # PriceClass_200 includes the Asia-Pacific edges — this stack serves
  # ap-southeast-1 users; PriceClass_100 (NA/EU only) would route every user
  # through a distant continent for pennies of savings.
  price_class = "PriceClass_200"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "${var.project}-alb"

    # The ALB serves plain HTTP (TLS terminates here at the edge); the
    # 180s read timeout covers the gateway's 120s AI-plan ceiling.
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 180
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "${var.project}-alb"
    viewer_protocol_policy = "redirect-to-https" # plain http:// viewers bounce

    # Every method the API uses (POST /api/itineraries, PUT, DELETE, …).
    allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods  = ["GET", "HEAD"]

    # CachingDisabled + AllViewerExceptHostHeader: nothing cached, everything
    # forwarded (cookies/query strings/headers — minus Host, which must stay
    # the ALB's for its routing).
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The free default certificate for *.cloudfront.net — the whole reason
  # this module exists (see header). Add aliases + acm_certificate_arn when
  # a real domain exists.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "${var.project}-cloudfront" }
}
