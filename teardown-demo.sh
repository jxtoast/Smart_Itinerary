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
# Step 4/5 is the COST GUARD: two resources can outlive the destroy and bill
# silently — unattached Elastic IPs (~$3.65/mo each; observed 2026-10-11:
# AWS left one behind when the ALB's ENI died, and it is not Terraform-
# managed) and the MQ brokers' own CloudWatch log groups (pennies). Both are
# checked and offered for release/deletion here.
#
# After it: < $0.10/mo idle (the state bucket). Redeploy: bash deploy-demo.sh.
# End of PROJECT entirely: bash final-shutdown.sh (returns the account to $0).

set -e

REGION="ap-southeast-1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF="$ROOT/infra/terraform"

say()  { echo ""; echo "══ $*"; }
die()  { echo ""; echo "!! FAILED: $*"; exit 1; }

say "0/5 PART 0 checks"
aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 \
  || die "AWS credentials not working — check ~/.aws/credentials"

say "1/5 teardown (~25–40 min; MQ broker deletion is the tail — do not cancel)"
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

say "2/5 verify the account is empty"
[ -z "$(aws ecs list-clusters --region "$REGION" --query 'clusterArns' --output text 2>/dev/null)" ] \
  || die "ECS clusters still present"
[ "$(aws rds describe-db-instances --region "$REGION" --query 'length(DBInstances)' --output text 2>/dev/null)" = "0" ] \
  || die "RDS instances still present"
[ "$(aws mq list-brokers --region "$REGION" --query 'length(BrokerSummaries)' --output text 2>/dev/null)" = "0" ] \
  || die "MQ brokers still present"
echo "  ECS/RDS/MQ/ALB/CloudFront: all gone ✓"

say "3/5 what survived (on purpose)"
echo "  Cognito pool: $(aws cognito-idp describe-user-pool --user-pool-id ap-southeast-1_Mbl4n33p5 --region "$REGION" --query 'UserPool.Name' --output text 2>/dev/null)"
echo "  State bucket: $(aws s3 ls --region "$REGION" | awk '{print $3}')"
echo "  SES identities: $(aws ses list-identities --region "$REGION" --query 'Identities' --output text 2>/dev/null)"

say "4/5 cost guard — nothing may bill silently after the destroy"

# a) Unattached Elastic IPs. Not Terraform-managed; AWS can leave one behind
#    when the ALB's ENI is deleted. An idle EIP bills ~$3.65/mo — the single
#    biggest post-teardown leak, so it is checked every single time.
UNATTACHED=$(aws ec2 describe-addresses --region "$REGION" \
  --query 'Addresses[?AssociationId==`null`].[AllocationId, PublicIp]' --output text)
if [ -n "$UNATTACHED" ]; then
  echo "  unattached Elastic IPs found — these bill ~\$3.65/mo each:"
  echo "$UNATTACHED" | sed 's/^/    /'
  for alloc in $(echo "$UNATTACHED" | awk '{print $1}'); do
    read -r -p "  release $alloc? [y/N] " yn
    case "$yn" in
      y|Y) aws ec2 release-address --region "$REGION" --allocation-id "$alloc" \
             && echo "    released $alloc" ;;
      *)   echo "    KEPT $alloc — it keeps billing until released" ;;
    esac
  done
else
  echo "  unattached Elastic IPs: none ✓"
fi

# b) Orphaned MQ log groups. Amazon MQ creates its own CloudWatch log groups
#    (/aws/amazonmq/...) which Terraform does NOT manage — after the destroy
#    they hold only dead-broker bytes. Pennies, but this is the "pennies of
#    CloudWatch storage" line, and deleting them is safe here: the brokers
#    are gone, so nothing recreates them.
ORPHANS=$(aws logs describe-log-groups --region "$REGION" \
  --query 'length(logGroups[?starts_with(logGroupName, `/aws/amazonmq`)])' --output text)
if [ "$ORPHANS" != "0" ]; then
  read -r -p "  delete $ORPHANS orphaned MQ log group(s)? [y/N] " yn
  case "$yn" in
    y|Y) for g in $(aws logs describe-log-groups --region "$REGION" \
              --query 'logGroups[?starts_with(logGroupName, `/aws/amazonmq`)].logGroupName' --output text)
         do aws logs delete-log-group --region "$REGION" --log-group-name "$g" >/dev/null; done
         echo "    deleted ✓"
         ;;
    *)   echo "    kept (storage pennies; delete any time — see TEARDOWN.md §5)" ;;
  esac
else
  echo "  orphaned MQ log groups: none ✓"
fi

say "TEARDOWN_COMPLETE — idle cost ≈ \$0.05/mo (the state bucket). Redeploy: bash deploy-demo.sh"
echo "   End of the PROJECT entirely (account to true \$0): bash final-shutdown.sh"
