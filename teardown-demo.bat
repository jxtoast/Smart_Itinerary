@echo off
setlocal
REM ============================================================
REM  Smart Itinerary - teardown (Windows).
REM  macOS/Linux users: run teardown-demo.sh instead.
REM
REM  Destroys the AWS deployment (25-40 min; MQ deletion is the tail)
REM  while KEEPING the Cognito module - localhost login keeps working.
REM
REM  Destroyed (data included): ECS, RDS (saved trips gone, by design),
REM    MQ, ALB, CloudFront (URL goes dark), ECR + images, S3 PDF bucket,
REM    Secrets Manager, CloudWatch.
REM  Survives: Cognito module ($0), Terraform state bucket (pennies),
REM    SES identities, IAM users.
REM ============================================================

set AWS_REGION=ap-southeast-1

echo.
echo == checks
aws sts get-caller-identity >nul 2>&1
if errorlevel 1 (echo !! AWS credentials not working - check %USERPROFILE%\.aws\credentials & exit /b 1)
echo    ok

echo.
echo == teardown (25-40 min; MQ deletion is the tail - do not cancel)
cd /d "%~dp0infra\terraform"
terraform destroy -target=module.cloudfront -target=module.ecs -target=module.cloudwatch -target=module.alb -target=module.secrets -target=module.rds -target=module.mq -target=module.s3 -target=module.ecr -target=module.network -auto-approve -no-color > "%TEMP%\teardown-demo.log" 2>&1
if errorlevel 1 (echo !! TEARDOWN FAILED & type "%TEMP%\teardown-demo.log" & exit /b 1)
findstr /C:"Destroy complete" "%TEMP%\teardown-demo.log"

echo.
echo == verify
aws ecs list-clusters --region %AWS_REGION% --query "length(clusterArns)" --output text
aws rds describe-db-instances --region %AWS_REGION% --query "length(DBInstances)" --output text
aws mq list-brokers --region %AWS_REGION% --query "length(BrokerSummaries)" --output text
echo    (all should read 0)
echo    Survived on purpose: Cognito module, state bucket, SES identities.
echo.
echo TEARDOWN_COMPLETE - idle cost about $1/month. Redeploy: deploy-demo.bat
