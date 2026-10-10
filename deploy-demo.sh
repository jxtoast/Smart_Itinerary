#!/usr/bin/env bash
#
# Smart Itinerary — demo-day deploy (macOS/Linux).
# Windows users: run deploy-demo.bat instead.
#
# Does, in order (stopping loudly at the first failure):
#   0/6 PART 0 checks            — Docker, AWS identity, region, credentials
#   1/6 terraform apply          — recreates the stack (~20–30 min; MQ is the tail)
#   2/6 build + push 8 images    — 7 services + the DDL loader (linux/amd64!)
#   3/6 DDL load ×4              — schemas into the 4 fresh RDS databases
#   4/6 force-rollout ×7         — backends → gateway → web
#   5/6 smoke + URL              — homepage, gateway health, sign-in route
#   6/6 local .env refresh       — Cognito client id changes every cycle
#
# Then: sign in → generate (2-day trips are fastest) → save →
#       Export PDF → Share. When done: bash teardown-demo.sh

set -e

REGISTRY="134580877391.dkr.ecr.ap-southeast-1.amazonaws.com"
REGION="ap-southeast-1"
CLUSTER="smart-itinerary"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF="$ROOT/infra/terraform"

say()  { echo ""; echo "══ $*"; }
die()  { echo ""; echo "!! FAILED: $*"; exit 1; }

say "0/6 PART 0 checks"
docker info --format 'docker up ({{.ServerVersion}})' >/dev/null 2>&1 \
  || die "Docker daemon not reachable — start Docker Desktop and retry"
aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 \
  || die "AWS credentials not working — check ~/.aws/credentials and ~/.aws/config"
grep -q "ap-southeast-1" ~/.aws/config 2>/dev/null \
  || echo "  (note: ~/.aws/config has no region line — commands below pass it explicitly)"

say "1/6 terraform apply (MQ broker recreate is the ~20–30 min tail — do not cancel)"
cd "$TF"
terraform plan -out=tfplan -no-color > /tmp/plan-demo.log 2>&1 \
  || { echo "PLAN FAILED:"; tail -15 /tmp/plan-demo.log; exit 1; }
if terraform show -no-color tfplan 2>/dev/null | grep -qE "aws_mq_broker.*will be replaced"
then
  die "MQ broker replacement detected in the plan — aborting for review"
fi
terraform apply -auto-approve -no-color tfplan > /tmp/apply-demo.log 2>&1 \
  || { echo "APPLY FAILED:"; tail -15 /tmp/apply-demo.log; exit 1; }
grep -E "Apply complete" /tmp/apply-demo.log || { echo "APPLY FAILED"; exit 1; }
rm -f tfplan

say "2/6 build + push 8 images (linux/amd64 — always)"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null \
  || die "ECR login failed"
docker build --platform linux/amd64 -f "$ROOT/.context/ddl-loader/Dockerfile" \
  -t "$REGISTRY/tools-service:ddl-loader" "$ROOT" \
  || die "ddl-loader build failed"
for svc in gateway auth-service itinerary-service gemini-service tools-service email-service; do
  docker build --platform linux/amd64 -f "$ROOT/services/$svc/Dockerfile" \
    -t "$REGISTRY/$svc:latest" "$ROOT" || die "$svc build failed"
done
docker build --platform linux/amd64 -f "$ROOT/apps/web/Dockerfile" \
  -t "$REGISTRY/web:latest" "$ROOT" || die "web build failed"
for img in tools-service:ddl-loader gateway auth-service itinerary-service \
           gemini-service tools-service email-service web; do
  case "$img" in *:*) TAG="$img";; *) TAG="$img:latest";; esac
  docker push "$REGISTRY/$TAG" >/dev/null || die "push failed: $TAG"
  echo "  pushed $TAG"
done

say "3/6 DDL load ×4 (cross-platform helper — stages, runs, verifies)"
python3 "$ROOT/scripts/ddl-stage.py" \
  || die "DDL failed — logs: /ecs/$CLUSTER/tools-service, stream prefix ddl"

say "4/6 force-rollout ×7 (backends → gateway → web)"
for svc in email-service auth-service itinerary-service gemini-service \
           tools-service gateway web; do
  aws ecs update-service --cluster "$CLUSTER" --service "$svc" \
    --force-new-deployment >/dev/null
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$svc" \
    || die "$svc did not reach steady state"
  echo "  $svc stable"
done

say "5/6 smoke + URL"
DOMAIN=$(aws cloudfront list-distributions --region "$REGION" \
  --query 'DistributionList.Items[0].DomainName' --output text)
echo "URL: https://$DOMAIN"
sleep 15   # CloudFront edge propagation
curl -s -o /dev/null -w "  homepage: HTTP %{http_code} (%{time_total}s)\n" \
  --max-time 25 "https://$DOMAIN/"
curl -s --max-time 15 "https://$DOMAIN/healthz" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('  gateway:', d['status'], '|', ', '.join(f'{k}:{v[\"status\"]}' for k,v in d['upstreams'].items()))" \
  || die "healthz probe failed"
curl -s -o /dev/null -w "  sign-in route: HTTP %{http_code}\n" \
  --max-time 15 "https://$DOMAIN/auth/start"

say "6/6 local .env refresh (localhost login)"
NEW_ID=$(terraform -chdir="$TF" output -raw cognito_web_client_id)
echo "  current Cognito client id: $NEW_ID"
python3 - "$NEW_ID" "$ROOT" <<'PYEOF'
import re, sys, os
new_id, root = sys.argv[1], sys.argv[2]
for rel in [".env", os.path.join("apps", "web", ".env")]:
    p = os.path.join(root, rel)
    if os.path.exists(p) and "COGNITO_CLIENT_ID" in open(p).read():
        t = re.sub(r'COGNITO_CLIENT_ID=.*', f'COGNITO_CLIENT_ID={new_id}', open(p).read())
        open(p, "w").write(t)
        print("  refreshed", rel)
PYEOF

say "RESTART_COMPLETE — sign in, generate, save, Export PDF, Share."
echo "   When done: bash teardown-demo.sh"
