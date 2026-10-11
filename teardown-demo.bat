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
echo == cost guard - nothing may bill silently after the destroy
REM a) Unattached Elastic IPs: not Terraform-managed, AWS can leave one behind
REM    when the ALB's ENI dies. An idle EIP bills ~$3.65/mo - check EVERY time.
set EIPCOUNT=0
for /f %%a in ('aws ec2 describe-addresses --region %AWS_REGION% --query "length(Addresses[?AssociationId==`null`])" --output text') do set EIPCOUNT=%%a
if "%EIPCOUNT%"=="0" echo    unattached Elastic IPs: none
if "%EIPCOUNT%"=="0" goto eip-done
echo    %EIPCOUNT% unattached Elastic IP^(s^) found - these bill ~$3.65/mo EACH:
aws ec2 describe-addresses --region %AWS_REGION% --query "Addresses[?AssociationId==`null`].[AllocationId,PublicIp]" --output table
set "CONFIRM="
set /p CONFIRM=Release ALL of them now? [y/N]
if /i not "%CONFIRM%"=="y" goto eip-done
for /f %%a in ('aws ec2 describe-addresses --region %AWS_REGION% --query "Addresses[?AssociationId==`null`].[AllocationId]" --output text') do aws ec2 release-address --region %AWS_REGION% --allocation-id %%a
echo    released
:eip-done
REM b) Orphaned MQ log groups: Amazon MQ creates its own CloudWatch log groups
REM    (/aws/amazonmq/...) which Terraform does NOT manage. Pennies, but safe to
REM    delete after the destroy - the brokers are gone, nothing recreates them.
set LG=0
for /f %%a in ('aws logs describe-log-groups --region %AWS_REGION% --query "length(logGroups[?starts_with(logGroupName, `/aws/amazonmq`)])" --output text') do set LG=%%a
if "%LG%"=="0" echo    orphaned MQ log groups: none
if "%LG%"=="0" goto lg-done
set "CONFIRM="
set /p CONFIRM=Delete %LG% orphaned MQ log group(s)? [y/N]
if /i not "%CONFIRM%"=="y" goto lg-done
for /f "delims=" %%g in ('aws logs describe-log-groups --region %AWS_REGION% --query "logGroups[?starts_with(logGroupName, `/aws/amazonmq`)].logGroupName" --output text') do aws logs delete-log-group --region %AWS_REGION% --log-group-name "%%g"
echo    deleted
:lg-done

echo.
echo TEARDOWN_COMPLETE - idle cost is pennies (the state bucket). Redeploy: deploy-demo.bat
echo    End of the PROJECT entirely (account to true $0): final-shutdown.bat
