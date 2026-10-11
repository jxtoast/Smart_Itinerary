#!/usr/bin/env bash
#
# Smart Itinerary — END-OF-PROJECT full shutdown (macOS/Linux).
# Windows users: final-shutdown.bat.
#
# Run ONLY after teardown-demo.sh has completed — this script REFUSES to run
# while any part of the stack still exists. The demo teardown deliberately
# leaves behind the $0/pennies survivors:
#
#   Cognito pool ($0) · SES identities ($0) · IAM users ($0) ·
#   Terraform state bucket (pennies) · possibly an unattached Elastic IP
#   (~$3.65/mo — caught by teardown's cost guard) · orphaned MQ log groups.
#
# This script removes ALL of it, so the account has nothing left to bill.
# ⚠️  It is FINAL: after step 7 the Terraform state bucket is gone — the
# platform can no longer be restored or destroyed via code (nothing is left
# running, so there is nothing to destroy; local compose still works).
# ⚠️  Step 7 also ends localhost Google sign-in forever (dev-token mode still
# works — see infra/terraform/modules/cognito/RUNBOOK.md for the env flip).
#
# Step 9 does NOT auto-delete the IAM users: one of them
# (smart-itinerary-terraform) owns the access key THIS terminal is using.
# It prints the exact commands instead — run them last, from another
# identity (root / a different admin user) or the console.

set -e

REGION="ap-southeast-1"
say(){ echo ""; echo "══ $*"; }
die(){ echo ""; echo "!! $*"; exit 1; }
confirm(){ read -r -p "$1 [y/N] " yn; [ "$yn" = "y" ] || [ "$yn" = "Y" ]; }

say "0/9 checks — the stack must already be torn down"
aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 \
  || die "AWS credentials not working — check ~/.aws/credentials"
[ "$(aws mq list-brokers --region "$REGION" --query 'length(BrokerSummaries)' --output text)" = "0" ] \
  || die "an MQ broker still exists — run teardown-demo.sh first"
[ "$(aws rds describe-db-instances --region "$REGION" --query 'length(DBInstances)' --output text)" = "0" ] \
  || die "RDS instances still exist — run teardown-demo.sh first"
[ "$(aws elbv2 describe-load-balancers --region "$REGION" --query 'length(LoadBalancers)' --output text)" = "0" ] \
  || die "a load balancer still exists — run teardown-demo.sh first"
echo "  stack gone ✓ — safe to remove the survivors"

say "1/9 unattached Elastic IPs (~\$3.65/mo each — the one real leak)"
UNATTACHED=$(aws ec2 describe-addresses --region "$REGION" \
  --query 'Addresses[?AssociationId==`null`].[AllocationId, PublicIp]' --output text)
if [ -n "$UNATTACHED" ]; then
  echo "$UNATTACHED" | sed 's/^/    /'
  confirm "  release ALL of them?" && \
    for alloc in $(echo "$UNATTACHED" | awk '{print $1}'); do
      aws ec2 release-address --region "$REGION" --allocation-id "$alloc" && echo "    released $alloc"
    done
else
  echo "  none ✓"
fi

say "2/9 CloudWatch log groups (orphaned MQ groups + anything else; storage pennies)"
LOGS=$(aws logs describe-log-groups --region "$REGION" --query 'length(logGroups)' --output text)
if [ "$LOGS" != "0" ]; then
  confirm "  delete all $LOGS log group(s) in this account?" && \
    for g in $(aws logs describe-log-groups --region "$REGION" \
               --query 'logGroups[].logGroupName' --output text); do
      aws logs delete-log-group --region "$REGION" --log-group-name "$g" >/dev/null
    done && echo "    deleted ✓"
else
  echo "  none ✓"
fi

say "3/9 leftover ECS task definitions (free, but tidy — incl. DDL-loader throwaways)"
TDS=$(aws ecs list-task-definitions --family-prefix smart-itinerary --status ACTIVE \
        --query 'length(taskDefinitionArns)' --output text)
if [ "$TDS" != "0" ]; then
  confirm "  deregister $TDS task definition revision(s)?" && \
    for td in $(aws ecs list-task-definitions --family-prefix smart-itinerary --status ACTIVE \
                 --query 'taskDefinitionArns' --output text); do
      aws ecs deregister-task-definition --task-definition "$td" >/dev/null && echo "    deregistered $td"
    done
else
  echo "  none ✓"
fi

say "4/9 leftover ECR repositories (should be 0 — teardown removes them with images)"
REPOS=$(aws ecr describe-repositories --region "$REGION" --query 'length(repositories)' --output text)
if [ "$REPOS" != "0" ]; then
  aws ecr describe-repositories --region "$REGION" \
    --query 'repositories[].repositoryName' --output text | tr '\t' '\n' | sed 's/^/    /'
  confirm "  delete ALL $REPOS repositories with their images?" && \
    for r in $(aws ecr describe-repositories --region "$REGION" \
               --query 'repositories[].repositoryName' --output text); do
      aws ecr delete-repository --region "$REGION" --repository-name "$r" --force >/dev/null \
        && echo "    deleted $r"
    done
else
  echo "  none ✓"
fi

say "5/9 leftover SNS topics + Cloud Map namespace (project-named only)"
TOPICS=$(aws sns list-topics --region "$REGION" \
           --query 'length(Topics[?contains(TopicArn, `smart-itinerary`)])' --output text)
if [ "$TOPICS" != "0" ]; then
  confirm "  delete $TOPICS smart-itinerary SNS topic(s)?" && \
    for t in $(aws sns list-topics --region "$REGION" \
               --query 'Topics[?contains(TopicArn, `smart-itinerary`)].TopicArn' --output text); do
      aws sns delete-topic --region "$REGION" --topic-arn "$t" && echo "    deleted $t"
    done
else
  echo "  SNS: none ✓"
fi
NSID=$(aws servicediscovery list-namespaces --region "$REGION" \
         --query 'Namespaces[?Name==`smart-itinerary.local`].Id' --output text)
if [ -n "$NSID" ] && [ "$NSID" != "None" ]; then
  confirm "  delete the smart-itinerary.local Cloud Map namespace?" && \
    aws servicediscovery delete-namespace --region "$REGION" --id "$NSID" >/dev/null \
    && echo "    deleted ✓" || echo "    (skipped — it still has services; harmless, $0)"
else
  echo "  Cloud Map: none ✓"
fi

say "6/9 SES verified identities (\$0 — remove only if you want the account bare)"
IDS=$(aws ses list-identities --region "$REGION" --query 'length(Identities)' --output text)
if [ "$IDS" != "0" ]; then
  aws ses list-identities --region "$REGION" --query 'Identities' --output text | tr '\t' '\n' | sed 's/^/    /'
  confirm "  delete all $IDS identity/identities?" && \
    for i in $(aws ses list-identities --region "$REGION" --query 'Identities' --output text); do
      aws ses delete-identity --region "$REGION" --identity "$i" && echo "    deleted $i"
    done
else
  echo "  none ✓"
fi

say "7/9 the Cognito pool (⚠️ FINAL — localhost Google sign-in dies; dev-token mode still works)"
POOLS=$(aws cognito-idp list-user-pools --region "$REGION" --max-results 10 \
          --query 'length(UserPools[?contains(Name, `smart-itinerary`)])' --output text)
if [ "$POOLS" != "0" ]; then
  confirm "  ⚠️  DELETE $POOLS smart-itinerary user pool(s) — no undo?" && \
    for p in $(aws cognito-idp list-user-pools --region "$REGION" --max-results 10 \
                --query 'UserPools[?contains(Name, `smart-itinerary`)].[Id]' --output text); do
      DOM=$(aws cognito-idp describe-user-pool --region "$REGION" --user-pool-id "$p" \
              --query 'UserPool.Domain' --output text)
      [ "$DOM" != "None" ] && [ -n "$DOM" ] \
        && aws cognito-idp delete-user-pool-domain --region "$REGION" --user-pool-id "$p" --domain "$DOM" \
        && echo "    deleted hosted domain $DOM"
      aws cognito-idp delete-user-pool --region "$REGION" --user-pool-id "$p" \
        && echo "    deleted pool $p"
    done
else
  echo "  none ✓"
fi

say "8/9 the Terraform state bucket (⚠️ FINAL — nothing can be terraform-restored after this)"
BUCKET=$(aws s3api list-buckets --query 'Buckets[?contains(Name, `smart-itinerary-tfstate`)].Name' --output text)
if [ -n "$BUCKET" ]; then
  echo "  $BUCKET (versioned — every historical state version is deleted below)"
  confirm "  ⚠️  EMPTY AND DELETE the state bucket — no undo?" && {
    aws s3api list-object-versions --bucket "$BUCKET" --query 'Versions[].[Key, VersionId]' --output text \
      | while read -r k v; do aws s3api delete-object --bucket "$BUCKET" --key "$k" --version-id "$v"; done
    aws s3api list-object-versions --bucket "$BUCKET" --query 'DeleteMarkers[].[Key, VersionId]' --output text \
      | while read -r k v; do aws s3api delete-object --bucket "$BUCKET" --key "$k" --version-id "$v"; done
    aws s3api delete-bucket --bucket "$BUCKET" && echo "    deleted ✓"
  }
else
  echo "  none ✓"
fi

say "9/9 IAM users — PRINTED, not executed (one of them owns THIS terminal's key)"
cat <<'EOF'
  The automation IAM users are $0 forever, but for a truly bare account run
  these LAST, from another identity (root / a different admin) or the console:

    # smart-itinerary-terraform (⚠️ owns the key in ~/.aws/credentials):
    aws iam list-access-keys --user-name smart-itinerary-terraform
    aws iam delete-access-key  --user-name smart-itinerary-terraform --access-key-id <KEYID>
    aws iam detach-user-policy --user-name smart-itinerary-terraform \
      --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
    aws iam delete-user --user-name smart-itinerary-terraform

    # smart-itinerary-ses-sender (SMTP credential user):
    aws iam list-access-keys --user-name smart-itinerary-ses-sender
    aws iam delete-access-key --user-name smart-itinerary-ses-sender --access-key-id <KEYID>
    aws iam list-user-policies --user-name smart-itinerary-ses-sender   # then delete each inline policy
    aws iam delete-user --user-name smart-itinerary-ses-sender

    # Budgets alarm: Billing console → Budgets → delete (free, but tidy).
    # Ultimate option: Billing → Account → Close account (nothing left to bill).
EOF

say "SHUTDOWN_ANALYSIS — what your chart's categories were, all now \$0"
echo "  MQ / RDS / ECS / ELB: destroyed with the stack (teardown-demo.sh)"
echo "  VPC: the Elastic IP leak — released in step 1 if you confirmed"
echo "  Others: log groups (2), state bucket (8) — deleted if you confirmed"
echo "  Remaining by choice: IAM users until step 9 is run manually (\$0)"
