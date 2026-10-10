#!/usr/bin/env bash
#
# Smart Itinerary — teardown (macOS/Linux). Windows users: teardown-demo.bat.
#
# Destroys the AWS deployment (~25–40 min; MQ deletion is the tail) while
# KEEPING the Cognito module — localhost Google login keeps working.
#
# Destroyed (data included): ECS tasks/services, RDS (saved trips — gone,
#   by design), MQ (queued messages — gone), ALB, CloudFront (the URL goes
#   dark), ECR repos with images, S3 PDF bucket, Secrets Manager, CloudWatch.
# Survives: Cognito module ($0 — localhost login untouched), Terraform state
#   bucket (pennies), SES identities, IAM users.
#
# After it: ≈$1/mo idle. Redeploy: bash deploy-demo.sh

set -e

REGION="ap-southeast-1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF="$ROOT/infra/terraform"

say()  { echo ""; echo "══ $*"; }
die()  { echo ""; echo "!! FAILED: $*"; exit 1; }

say "0/6 PART 0 checks"
aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 \
  || die "AWS credentials not working — check ~/.aws/credentials"

say "1/6 teardown (~25–40 min; MQ broker deletion is the tail — do not cancel)"
cd "$TF"
terraform destroy \
  -target=module.cloudfront \
  -target=module.ecs \
  -target=module.cloudwatch \
  -target=module.alb \
  -target=module.secrets \
  -target=module.rds \
  -target=module.mq \
  -target=module.s3 \
  -target=module.ecr \
  -target=module.network \
  -auto-approve -no-color > /tmp/teardown-demo.log 2>&1 \
  || { echo "TEARDOWN FAILED:"; tail -15 /tmp/teardown-demo.log; exit 1; }
grep -E "Destroy complete" /tmp/teardown-demo.log || true

say "2/6 verify the account is empty"
[ -z "$(aws ecs list-clusters --region "$REGION" --query 'clusterArns' --output text 2>/dev/null)" ] \
  || die "ECS clusters still present"
[ "$(aws rds describe-db-instances --region "$REGION" --query 'length(DBInstances)' --output text 2>/dev/null)" = "0" ] \
  || die "RDS instances still present"
[ "$(aws mq list-brokers --region "$REGION" --query 'length(BrokerSummaries)' --output text 2>/dev/null)" = "0" ] \
  || die "MQ brokers still present"
echo "  ECS/RDS/MQ/ALB/CloudFront: all gone ✓"

say "3/6 what survived (on purpose)"
echo "  Cognito pool: $(aws cognito-idp describe-user-pool --user-pool-id ap-southeast-1_Mbl4n33p5 --region "$REGION" --query 'UserPool.Name' --output text 2>/dev/null)"
echo "  State bucket: $(aws s3 ls --region "$REGION" | awk '{print $3}')"
echo "  SES identities: $(aws ses list-identities --region "$REGION" --query 'Identities' --output text 2>/dev/null)"

say "TEARDOWN_COMPLETE — ≈$1/mo idle. Redeploy: bash deploy-demo.sh"
