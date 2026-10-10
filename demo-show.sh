#!/usr/bin/env bash
# Smart Itinerary — live infrastructure status (read-only, safe to run anytime)
# Usage: bash demo-show.sh
set -e
REGION="ap-southeast-1"
CLUSTER="smart-itinerary"

echo "──────────────────────────────────────────────────────────"
echo " Smart Itinerary — live on AWS (region: $REGION)"
echo "──────────────────────────────────────────────────────────"

echo ""
echo "▶ Services running on ECS Fargate:"
aws ecs describe-services --cluster "$CLUSTER" \
  --services email-service auth-service itinerary-service gemini-service \
             tools-service gateway web --region "$REGION" \
  --query 'services[].{Service:serviceName,Desired:desiredCount,Running:runningCount,Status:deployments[0].rolloutState}' \
  --output table

echo ""
echo "▶ Public URL (CloudFront) + health:"
DOMAIN=$(aws cloudfront list-distributions --region "$REGION" \
  --query 'DistributionList.Items[0].DomainName' --output text)
echo "  https://$DOMAIN"
curl -s -o /dev/null --max-time 20 -w "  homepage: HTTP %{http_code} (%{time_total}s)\n" "https://$DOMAIN/"
curl -s --max-time 15 "https://$DOMAIN/healthz" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('  gateway:', d['status'], '| all upstreams:', ', '.join(f'{k}:{v[\"status\"]}' for k,v in d['upstreams'].items()))"

echo ""
echo "▶ Container images (ECR, pushed timestamps):"
for repo in gateway auth-service itinerary-service gemini-service tools-service email-service web; do
  PUSHED=$(aws ecr describe-images --repository-name "$repo" --region "$REGION" \
    --query 'sort_by(imageDetails,&imagePushedAt)[-1].imagePushedAt' --output text 2>/dev/null)
  echo "  $repo: pushed ${PUSHED%% *}"
done

echo ""
echo "▶ Recent AWS audit trail (CloudTrail — the deploy fingerprints):"
aws cloudtrail lookup-events --region "$REGION" --max-results 6 \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=ecs.amazonaws.com \
  --query 'Events[].{time:EventTime,action:EventName}' --output table 2>/dev/null

echo ""
echo "▶ Databases (RDS):"
aws rds describe-db-instances --region "$REGION" \
  --query 'DBInstances[].{DB:DBInstanceIdentifier,Engine:Engine,Status:DBInstanceStatus}' \
  --output table
echo "──────────────────────────────────────────────────────────"
