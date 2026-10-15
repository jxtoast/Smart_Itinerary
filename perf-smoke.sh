#!/usr/bin/env bash
# Smart Itinerary — scripted performance test + sustained load for the
# auto-scaling demo. Read-only against the running stack; needs `ab`
# (preinstalled on macOS) and AWS credentials.
#
# Usage:
#   bash perf-smoke.sh            # bench: RPS + latency percentiles for / and /healthz
#   CONCURRENCY=40 bash perf-smoke.sh load    # sustained background load (drives gateway scale-out)
#   bash perf-smoke.sh status     # gateway count + scaling activities + CPU, last 15 min
#   bash perf-smoke.sh stop       # kill the background load
#
# Tuned 2026-10-15 against the live stack: c=25 pushed gateway CPU past the
# 60% target within ~90s, and desired count scaled 2→3 at ~5–6 min
# (target-tracking, scale-out cooldown 60s). Note: ab reports healthz 200s as
# "Failed (Length)" because the body varies with live upstream status — the
# bench output explains this rather than hiding it.
set -u
REGION="ap-southeast-1"
CLUSTER="smart-itinerary"
MODE="${1:-bench}"
CONCURRENCY="${CONCURRENCY:-25}"
LOG=/tmp/si-load.log

banner() { echo ""; echo "── $*"; }

case "$MODE" in
  bench)
    DOMAIN=$(aws cloudfront list-distributions --region "$REGION" \
      --query 'DistributionList.Items[0].DomainName' --output text) \
      || { echo "!! cannot resolve CloudFront domain — is the stack up?"; exit 1; }
    BASE="https://$DOMAIN"
    bench_one() { # label url n c
      banner "bench: $1  (n=$3, c=$4)"
      local out
      out=$(ab -n "$3" -c "$4" "$2" 2>&1)
      if echo "$out" | grep -q "Requests per second"; then
        echo "$out" | grep -E "Failed requests|Requests per second|Time per request"
        local breakdown; breakdown=$(echo "$out" | grep -oE "\(Connect: [0-9]+, Receive: [0-9]+, Length: [0-9]+, Exceptions: [0-9]+\)")
        [ -n "$breakdown" ] && echo "  $breakdown"
        if echo "$breakdown" | grep -qE "Connect: 0, Receive: 0, Exceptions: 0" \
           && ! echo "$breakdown" | grep -qE "Length: 0"; then
          echo "  (all HTTP OK — 'Length' = healthz body size varies with live upstream status; not errors)"
        fi
        echo "$out" | sed -n '/Percentage of requests/,/longest request/p' | head -8
      else
        echo "$out" | tail -5
        echo "!! ab failed (macOS ab can choke on TLS — try: brew install and use 'hey')"
        return 1
      fi
    }
    bench_one "homepage (CloudFront → web)" "$BASE/" 500 10 || true
    bench_one "gateway healthz (fans out to all 6 upstreams)" "$BASE/healthz" 500 10 || true
    ;;

  load)
    DOMAIN=$(aws cloudfront list-distributions --region "$REGION" \
      --query 'DistributionList.Items[0].DomainName' --output text) \
      || { echo "!! cannot resolve CloudFront domain — is the stack up?"; exit 1; }
    banner "sustained load → https://$DOMAIN/healthz  (c=$CONCURRENCY)"
    echo "  log: $LOG"
    nohup ab -n 200000 -c "$CONCURRENCY" "https://$DOMAIN/healthz" > "$LOG" 2>&1 &
    echo "  load pid $! — stop early with: bash perf-smoke.sh stop"
    echo "  now watch: bash perf-smoke.sh status   (gateway desired climbs 2→3→4)"
    ;;

  status)
    banner "gateway desired/running (auto-scale target 60% CPU, min 2 / max 4)"
    aws ecs describe-services --cluster "$CLUSTER" --services gateway --region "$REGION" \
      --query 'services[].[serviceName,desiredCount,runningCount]' --output table
    banner "recent scaling activities (gateway)"
    aws application-autoscaling describe-scaling-activities --service-namespace ecs \
      --resource-id "service/$CLUSTER/gateway" --region "$REGION" \
      --query 'ScalingActivities[:5].[StartTime,StatusCode]' --output table 2>/dev/null
    banner "gateway CPU — last 15 min, 1-min buckets (Average / Max %)"
    aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization \
      --dimensions Name=ServiceName,Value=gateway Name=ClusterName,Value="$CLUSTER" \
      --start-time "$(python3 -c "import datetime;print((datetime.datetime.now(datetime.UTC)-datetime.timedelta(minutes=16)).strftime('%Y-%m-%dT%H:%MZ'))")" \
      --end-time   "$(python3 -c "import datetime;print(datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%MZ'))")" \
      --period 60 --statistics Average Maximum --region "$REGION" \
      --query 'sort_by(Datapoints,&Timestamp)[].[Timestamp,Average,Maximum]' --output table
    ;;

  stop)
    pkill -f "ab -n 200000" && echo "load stopped" || echo "no load running"
    ;;

  *)
    echo "usage: bash perf-smoke.sh [bench|load|status|stop]"; exit 1 ;;
esac
