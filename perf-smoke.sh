#!/usr/bin/env bash
# Smart Itinerary — scripted performance test + sustained load for the
# auto-scaling demo. Read-only against the running stack; needs `ab`
# (preinstalled on macOS) and AWS credentials.
#
# Usage:
#   bash perf-smoke.sh            # bench: RPS + latency percentiles for / and /healthz
#   bash perf-smoke.sh demo       # ONE COMMAND: load → live-poll until scale-out →
#                                 #   activities + CPU + bench → stops the load. (~10 min)
#   CONCURRENCY=40 bash perf-smoke.sh load    # sustained background load (drives gateway scale-out)
#   bash perf-smoke.sh status     # gateway count + scaling activities + CPU, last 15 min
#   bash perf-smoke.sh stop       # kill the background load
#
# Tuned 2026-10-15/16 against the live stack:
#   - c=25 (111 req/s) and c=40 (~196 req/s) both oscillate 44-61% CPU — AT
#     the 60% target, never sustained above → no reliable scale-out
#   - c=80 (~220 req/s) FORCES the breach: verified live — desired 2→3 after
#     ~401s of load; LOAD_N=65000 keeps firing (auto-relaunch) until scale
#   - scale-in back to 2 takes ~15-17 min after the load stops (300s cooldown
#     + evaluation lag) — narrate as the thermostat's caution
# Note: ab reports healthz 200s as "Failed (Length)" because the body varies
# with live upstream status — bench explains this rather than hiding it.
set -u
REGION="ap-southeast-1"
CLUSTER="smart-itinerary"
MODE="${1:-bench}"
CONCURRENCY="${CONCURRENCY:-80}"   # verified: c=25/c=40 hover AT the 60% CPU target
                                    # (~44-61% oscillating — no scale); c=80 forces both
                                    # tasks past target and scales deterministically
LOAD_N="${LOAD_N:-65000}"   # ≈50k empirically triggers scale-out; this is +30%
LOG=/tmp/si-load.log
BASE_URL=""                 # set by resolve_domain
APPROX_RPS=220              # measured at c=80 — used for the live count estimate

resolve_domain() {
  DOMAIN=$(aws cloudfront list-distributions --region "$REGION" \
    --query 'DistributionList.Items[0].DomainName' --output text) \
    || { echo "!! cannot resolve CloudFront domain — is the stack up?"; exit 1; }
  BASE_URL="https://$DOMAIN"
}

gateway_desired() {
  aws ecs describe-services --cluster "$CLUSTER" --services gateway --region "$REGION" \
    --query 'services[0].desiredCount' --output text 2>/dev/null
}

banner() { echo ""; echo "── $*"; }

bench_one() { # label url n c
  banner "bench: $1  (n=$3, c=$4)"
  local out
  out=$(ab -n "$3" -c "$4" "$2" 2>&1)
  if echo "$out" | grep -q "Requests per second"; then
    echo "$out" | grep -E "Failed requests|Requests per second|Time per request" | grep -v "across all"
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

start_load() { # echoes the ab pid
  nohup ab -n "$LOAD_N" -c "$CONCURRENCY" "$BASE_URL/healthz" > "$LOG" 2>&1 &
  echo $!
}

case "$MODE" in
  bench)
    resolve_domain
    bench_one "homepage (CloudFront → web)" "$BASE_URL/" 500 10 || true
    bench_one "gateway healthz (fans out to all 6 upstreams)" "$BASE_URL/healthz" 500 10 || true
    ;;

  load)
    resolve_domain
    banner "sustained load → $BASE_URL/healthz  (c=$CONCURRENCY, n=$LOAD_N)"
    echo "  log: $LOG"
    PID=$(start_load); echo "  load pid $PID — stop early with: bash perf-smoke.sh stop"
    echo "  now watch: bash perf-smoke.sh status   (gateway desired climbs 2→3→4)"
    ;;

  demo)
    resolve_domain
    BASELINE=$(gateway_desired)
    echo "── ONE-COMMAND SCALING DEMO — gateway baseline: desired=$BASELINE"
    [ "$BASELINE" -gt 2 ] 2>/dev/null && {
      echo "!! gateway is above its minimum (recent scale-in?) — wait for it to settle at 2 first:"
      echo "!!   watch: bash perf-smoke.sh status"; exit 1; }
    banner "firing $LOAD_N requests at /healthz (c=$CONCURRENCY) — polling for scale-out"
    PID=$(start_load)
    START=$(date +%s)
    while :; do
      sleep 20
      kill -0 "$PID" 2>/dev/null || { echo "  ab drained before scale-out — refiring"; PID=$(start_load); }
      NOW=$(date +%s); ELAPSED=$(( NOW - START ))
      DESIRED=$(gateway_desired)
      echo "  t+${ELAPSED}s  desired=$DESIRED  (≈$(( APPROX_RPS * ELAPSED / 1000 ))k requests fired)"
      [ "$DESIRED" -gt "$BASELINE" ] && break
      [ "$ELAPSED" -ge 900 ] && { echo "!! no scale-out in 15 min — run: bash perf-smoke.sh status"; kill "$PID" 2>/dev/null; exit 1; }
    done
    echo ""
    echo "  ** SCALE-OUT: desired $BASELINE -> $DESIRED after ~$(( APPROX_RPS * ELAPSED / 1000 ))k requests / ${ELAPSED}s"
    sleep 30   # let the activity register
    banner "the audit trail"
    aws application-autoscaling describe-scaling-activities --service-namespace ecs \
      --resource-id "service/$CLUSTER/gateway" --region "$REGION" \
      --query 'ScalingActivities[:2].[StartTime,StatusCode]' --output table 2>/dev/null
    bash perf-smoke.sh stop >/dev/null
    banner "load stopped — bench numbers (CPU now falls; desired returns to $BASELINE in ~5–10 min)"
    bench_one "homepage (CloudFront → web)" "$BASE_URL/" 300 10 || true
    bench_one "gateway healthz (fans out to all 6 upstreams)" "$BASE_URL/healthz" 300 10 || true
    echo ""
    echo "── done. CPU table for slides: bash perf-smoke.sh status"
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
    pkill -f "ab -n $LOAD_N" && echo "load stopped" || echo "no load running"
    ;;

  *)
    echo "usage: bash perf-smoke.sh [bench|demo|load|status|stop]"; exit 1 ;;
esac
