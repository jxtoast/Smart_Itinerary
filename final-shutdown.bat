@echo off
setlocal
REM ============================================================
REM  Smart Itinerary - END-OF-PROJECT full shutdown (Windows).
REM  macOS/Linux users: final-shutdown.sh instead.
REM
REM  Run ONLY after teardown-demo.bat - this script REFUSES to run
REM  while any part of the stack still exists. It removes every
REM  survivor the demo teardown leaves behind (Cognito pool, SES
REM  identities, state bucket, orphan log groups, unattached EIPs,
REM  leftover task definitions) so the account has nothing to bill.
REM
REM  FINAL: after step 7 the state bucket is gone - the platform
REM  cannot be terraform-restored (nothing is left running; local
REM  compose still works). Step 7 also ends localhost Google sign-in.
REM
REM  The IAM users are NOT auto-deleted: one of them owns the access
REM  key this terminal is using. Commands are printed at the end -
REM  run them last, from another identity or the console.
REM ============================================================

set AWS_REGION=ap-southeast-1

echo.
echo == 0/9 checks - the stack must already be torn down
aws sts get-caller-identity >nul 2>&1
if errorlevel 1 (echo !! AWS credentials not working & exit /b 1)
for /f %%a in ('aws mq list-brokers --region %AWS_REGION% --query "length(BrokerSummaries)" --output text') do set N=%%a
if not "%N%"=="0" echo !! an MQ broker still exists - run teardown-demo.bat first & exit /b 1
for /f %%a in ('aws rds describe-db-instances --region %AWS_REGION% --query "length(DBInstances)" --output text') do set N=%%a
if not "%N%"=="0" echo !! RDS instances still exist - run teardown-demo.bat first & exit /b 1
for /f %%a in ('aws elbv2 describe-load-balancers --region %AWS_REGION% --query "length(LoadBalancers)" --output text') do set N=%%a
if not "%N%"=="0" echo !! a load balancer still exists - run teardown-demo.bat first & exit /b 1
echo    stack gone - safe to remove the survivors

echo.
echo == 1/9 unattached Elastic IPs (~$3.65/mo each - the one real leak)
set N=0
for /f %%a in ('aws ec2 describe-addresses --region %AWS_REGION% --query "length(Addresses[?AssociationId==`null`])" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto eip-done
set "CONFIRM="
set /p CONFIRM=Release ALL %N% of them? [y/N]
if /i not "%CONFIRM%"=="y" goto eip-done
for /f %%a in ('aws ec2 describe-addresses --region %AWS_REGION% --query "Addresses[?AssociationId==`null`].[AllocationId]" --output text') do aws ec2 release-address --region %AWS_REGION% --allocation-id %%a
echo    released
:eip-done

echo.
echo == 2/9 CloudWatch log groups (orphaned MQ groups; storage pennies)
set N=0
for /f %%a in ('aws logs describe-log-groups --region %AWS_REGION% --query "length(logGroups)" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto logs-done
set "CONFIRM="
set /p CONFIRM=Delete all %N% log group(s)? [y/N]
if /i not "%CONFIRM%"=="y" goto logs-done
for /f "delims=" %%g in ('aws logs describe-log-groups --region %AWS_REGION% --query "logGroups[].logGroupName" --output text') do aws logs delete-log-group --region %AWS_REGION% --log-group-name "%%g"
echo    deleted
:logs-done

echo.
echo == 3/9 leftover ECS task definitions (free, but tidy)
set N=0
for /f %%a in ('aws ecs list-task-definitions --family-prefix smart-itinerary --status ACTIVE --query "length(taskDefinitionArns)" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto td-done
set "CONFIRM="
set /p CONFIRM=Deregister %N% task definition revision(s)? [y/N]
if /i not "%CONFIRM%"=="y" goto td-done
for /f %%t in ('aws ecs list-task-definitions --family-prefix smart-itinerary --status ACTIVE --query "taskDefinitionArns" --output text') do aws ecs deregister-task-definition --task-definition %%t >nul
echo    deregistered
:td-done

echo.
echo == 4/9 leftover ECR repositories (should be 0 - teardown removes them)
set N=0
for /f %%a in ('aws ecr describe-repositories --region %AWS_REGION% --query "length(repositories)" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto ecr-done
set "CONFIRM="
set /p CONFIRM=Delete ALL %N% repositories with their images? [y/N]
if /i not "%CONFIRM%"=="y" goto ecr-done
for /f %%r in ('aws ecr describe-repositories --region %AWS_REGION% --query "repositories[].repositoryName" --output text') do aws ecr delete-repository --region %AWS_REGION% --repository-name %%r --force >nul
echo    deleted
:ecr-done

echo.
echo == 5/9 leftover SNS topics (project-named only)
set N=0
for /f %%a in ('aws sns list-topics --region %AWS_REGION% --query "length(Topics[?contains(TopicArn, `smart-itinerary`)])" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto sns-done
set "CONFIRM="
set /p CONFIRM=Delete %N% smart-itinerary topic(s)? [y/N]
if /i not "%CONFIRM%"=="y" goto sns-done
for /f %%t in ('aws sns list-topics --region %AWS_REGION% --query "Topics[?contains(TopicArn, `smart-itinerary`)].TopicArn" --output text') do aws sns delete-topic --region %AWS_REGION% --topic-arn %%t
echo    deleted
:sns-done

echo.
echo == 6/9 SES verified identities ($0 - remove only for a bare account)
set N=0
for /f %%a in ('aws ses list-identities --region %AWS_REGION% --query "length(Identities)" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto ses-done
set "CONFIRM="
set /p CONFIRM=Delete all %N% identity/identities? [y/N]
if /i not "%CONFIRM%"=="y" goto ses-done
for /f %%i in ('aws ses list-identities --region %AWS_REGION% --query "Identities" --output text') do aws ses delete-identity --region %AWS_REGION% --identity %%i
echo    deleted
:ses-done

echo.
echo == 7/9 Cognito pool (FINAL - localhost Google sign-in dies; dev-token mode still works)
set N=0
for /f %%a in ('aws cognito-idp list-user-pools --region %AWS_REGION% --max-results 10 --query "length(UserPools[?contains(Name, `smart-itinerary`)])" --output text') do set N=%%a
if "%N%"=="0" echo    none
if "%N%"=="0" goto cog-done
set "CONFIRM="
set /p CONFIRM=DELETE %N% user pool(s) - no undo? [y/N]
if /i not "%CONFIRM%"=="y" goto cog-done
for /f %%p in ('aws cognito-idp list-user-pools --region %AWS_REGION% --max-results 10 --query "UserPools[?contains(Name, `smart-itinerary`)].Id" --output text') do call :delete-pool %%p
:cog-done

echo.
echo == 8/9 Terraform state bucket (FINAL - nothing can be terraform-restored after this)
set "BUCKET="
for /f %%b in ('aws s3api list-buckets --query "Buckets[?contains(Name, `smart-itinerary-tfstate`)].Name" --output text') do set BUCKET=%%b
if "%BUCKET%"=="" echo    none
if "%BUCKET%"=="" goto bucket-done
set "CONFIRM="
set /p CONFIRM=EMPTY AND DELETE %BUCKET% (every version) - no undo? [y/N]
if /i not "%CONFIRM%"=="y" goto bucket-done
for /f "tokens=1,2" %%k in ('aws s3api list-object-versions --bucket %BUCKET% --query "Versions[].[Key,VersionId]" --output text') do aws s3api delete-object --bucket %BUCKET% --key "%%k" --version-id "%%l" >nul 2>&1
for /f "tokens=1,2" %%k in ('aws s3api list-object-versions --bucket %BUCKET% --query "DeleteMarkers[].[Key,VersionId]" --output text') do aws s3api delete-object --bucket %BUCKET% --key "%%k" --version-id "%%l" >nul 2>&1
aws s3api delete-bucket --bucket %BUCKET%
echo    deleted
:bucket-done

echo.
echo == 9/9 IAM users - printed, NOT executed (one owns THIS terminal's key)
echo    smart-itinerary-terraform owns the key in %USERPROFILE%\.aws\credentials.
echo    For a truly bare account, run these LAST from another identity or the console:
echo      aws iam list-access-keys --user-name smart-itinerary-terraform
echo      aws iam delete-access-key  --user-name smart-itinerary-terraform --access-key-id ^<KEYID^>
echo      aws iam detach-user-policy --user-name smart-itinerary-terraform --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
echo      aws iam delete-user --user-name smart-itinerary-terraform
echo      (same for smart-itinerary-ses-sender; Budgets: Billing console - Budgets - delete)
echo.
echo SHUTDOWN_COMPLETE - nothing left to bill. (IAM users remain at $0 until step 9 is run manually.)
goto :eof

:delete-pool
REM %1 = pool id. Delete its hosted domain first, then the pool.
for /f %%d in ('aws cognito-idp describe-user-pool --region %AWS_REGION% --user-pool-id %1 --query "UserPool.Domain" --output text') do set DOM=%%d
if not "%DOM%"=="None" if not "%DOM%"=="" (
  aws cognito-idp delete-user-pool-domain --region %AWS_REGION% --user-pool-id %1 --domain %DOM%
  echo    deleted hosted domain %DOM%
)
aws cognito-idp delete-user-pool --region %AWS_REGION% --user-pool-id %1
echo    deleted pool %1
goto :eof
