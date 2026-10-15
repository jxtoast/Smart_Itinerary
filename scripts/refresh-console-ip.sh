#!/usr/bin/env bash
#
# Refresh the RabbitMQ web-console allowlist to THIS machine's current
# public IP and apply (SG-only, in-place, ~30 s). Run it whenever you switch
# networks (home WiFi <-> phone hotspot) before opening the console.
# Windows: refresh-console-ip.bat
#
# Safety: refuses to apply if the plan contains any resource replacement —
# a casual IP refresh must never recreate infrastructure. (The one-time
# broker flip that enables the console is therefore done via deploy-demo.sh
# with ALLOW_MQ_REPLACE=1, not through this script.)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 "$ROOT/scripts/refresh-console-ip.py"

cd "$ROOT/infra/terraform"
terraform plan -no-color -out=/tmp/console-ip-plan.tfplan > /tmp/console-ip-plan.log 2>&1 \
  || { echo "!! PLAN FAILED:"; tail -15 /tmp/console-ip-plan.log; exit 1; }
if grep -qE "(must|will) be replaced" /tmp/console-ip-plan.log; then
  echo "!! plan contains resource REPLACEMENTS — not just the SG rule. Aborting:"
  grep "^  # " /tmp/console-ip-plan.log | head -5
  exit 1
fi
terraform apply -auto-approve -no-color /tmp/console-ip-plan.tfplan > /tmp/console-ip-apply.log 2>&1 \
  || { echo "!! APPLY FAILED:"; tail -15 /tmp/console-ip-apply.log; exit 1; }
grep -E "Apply complete" /tmp/console-ip-apply.log

URL=$(aws mq describe-broker --broker-id smart-itinerary-rabbitmq \
  --query "Instances[0].Endpoints[?contains(@,'https')]" --output text 2>/dev/null || true)
if [ -n "$URL" ]; then
  echo "  console: $URL"
  echo "  login: broker_username / broker_password from terraform.tfvars"
else
  echo "  (broker endpoint not found — is the stack up?)"
fi
