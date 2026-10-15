#!/usr/bin/env bash
#
# RabbitMQ queue-viewer — live queue table from INSIDE the VPC. The demo-day
# stand-in for the web console (the broker is private by decision, T4.14).
# Windows: broker-queues.bat
#
# Builds + pushes the viewer image when ECR lacks it (repos are emptied on
# every apply cycle), then scripts/broker-queues.py stages/runs the
# throwaway task and prints the table.

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="134580877391.dkr.ecr.ap-southeast-1.amazonaws.com"
REGION="ap-southeast-1"

if ! aws ecr describe-images --repository-name tools-service \
     --image-ids imageTag=mq-viewer --region "$REGION" >/dev/null 2>&1; then
  echo "  image tools-service:mq-viewer not in ECR — building (one-time per stack cycle)…"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  docker build --platform linux/amd64 \
    -f "$ROOT/.context/mq-viewer/Dockerfile" \
    -t "${REGISTRY}/tools-service:mq-viewer" "$ROOT" \
    || { echo "!! mq-viewer image build failed"; exit 1; }
  docker push "${REGISTRY}/tools-service:mq-viewer" >/dev/null \
    || { echo "!! mq-viewer push failed"; exit 1; }
fi

python3 "$ROOT/scripts/broker-queues.py"
