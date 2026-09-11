# CloudWatch — the diagram's "CloudWatch" box (log groups + alarms).
#
# Two jobs:
#   1. One log group per service — the awslogs driver in every task definition
#      (modules/ecs) writes here. Retention is deliberately short: log storage
#      is the quietest way to run up a bill on an idle demo stack.
#   2. A few alarms that catch the failures this architecture actually has:
#      the ALB has no healthy gateway (the whole app is down), the ALB is
#      serving 5xx, or a database is CPU-saturated.

resource "aws_cloudwatch_log_group" "services" {
  for_each = toset(var.service_names)

  name              = "/ecs/${var.project}/${each.value}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${var.project}-${each.value}-logs" }
}

# ── Alarm fan-out ─────────────────────────────────────────────────────────────

resource "aws_sns_topic" "alarms" {
  name = "${var.project}-alarms"

  tags = { Name = "${var.project}-alarms" }
}

# Email subscription exists only when an address is configured; AWS sends a
# confirmation mail the owner must click before anything is delivered.
resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# "No healthy gateway in either AZ" — the one alarm that means the app is
# unreachable even if everything else looks fine.
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.project}-alb-unhealthy-hosts"
  alarm_description   = "The ALB has no healthy gateway target — the app is down."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching" # a dead ALB reports nothing — treat that as bad

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

# Server-error rate from the whole stack (gateway 5xx + forwarded upstream 5xx).
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.project}-alb-5xx"
  alarm_description   = "Sustained 5xx rate at the ALB — an upstream is failing behind the gateway."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

# One CPU alarm per database (auth/itinerary/gemini/tools) — the cheapest
# useful "is this instance drowning" signal.
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  for_each = var.rds_instance_identifiers

  alarm_name          = "${var.project}-rds-cpu-${each.key}"
  alarm_description   = "RDS ${each.key} (${each.value}) CPU above 80% for 10 minutes."
  alarm_actions       = [aws_sns_topic.alarms.arn]
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 10
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = each.value
  }
}
