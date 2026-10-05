# Auto-scaling — the diagram's "auto-scaled" adjective, as code.
#
# docker-compose runs a fixed number of copies of each service; on ECS that
# number is something AWS can move. These resources hand it to Application
# Auto Scaling with two declarations per service:
#
#   scalable target = the bounds: the count may live anywhere in [min, max]
#   tracking policy = the rule: keep average CPU near the target — AWS adds a
#                     task when busy and removes one when idle, thermostat-style
#
# `desired_count` on the ECS service (main.tf) is only the bootstrap value;
# from the first policy evaluation onward the count is managed here. The mins
# equal the bootstrap counts, so the handover is invisible. No IAM is needed:
# Application Auto Scaling uses its AWS-managed service-linked role.
#
# $0 note: code-only, like the rest of this scaffold — never applied. Worst
# case at full scale-out: 4 + 5×3 = 19 Fargate tasks (see the README cost
# table before ever applying with maxes raised).

locals {
  # min = the service's bootstrap desired_count (main.tf); max = demo-scale
  # headroom; cpu_target = % average CPU the tracker aims to hold.
  autoscaling = {
    gateway           = { min = var.gateway_desired_count, max = 4, cpu_target = 60 }
    auth-service      = { min = 1, max = 3, cpu_target = 60 }
    itinerary-service = { min = 1, max = 3, cpu_target = 60 }
    gemini-service    = { min = 1, max = 3, cpu_target = 60 }
    email-service     = { min = 1, max = 3, cpu_target = 60 }
    tools-service     = { min = 1, max = 3, cpu_target = 60 }
  }
}

resource "aws_appautoscaling_target" "service" {
  for_each           = local.autoscaling
  min_capacity       = each.value.min
  max_capacity       = each.value.max
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = local.autoscaling
  name               = "${var.project}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = each.value.cpu_target
    scale_in_cooldown  = 300 # scale-in cautiously: 5 min of quiet first
    scale_out_cooldown = 60  # scale-out fast: 1 min of sustained load
  }
}
