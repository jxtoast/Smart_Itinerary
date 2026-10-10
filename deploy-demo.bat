@echo off
setlocal
REM ============================================================
REM  Smart Itinerary - demo-day deploy (Windows).
REM  macOS/Linux users: run deploy-demo.sh instead.
REM
REM  Steps (stops loudly at the first failure):
REM    0/6 checks       - Docker, AWS identity, region
REM    1/6 apply        - recreates the stack (MQ is the 20-30 min tail)
REM    2/6 build+push   - 8 images (7 services + DDL loader), linux/amd64
REM    3/6 DDL x4       - schemas into the 4 fresh RDS databases
REM    4/6 rollout x7   - backends, then gateway, then web
REM    5/6 verify       - URL, homepage, gateway health, sign-in route
REM    6/6 reminder     - Cognito client id changed; refresh local .env
REM
REM  Then: sign in, generate (2-day trips are fastest), save,
REM        Export PDF, Share. When done: teardown-demo.bat
REM ============================================================

set REGISTRY=134580877391.dkr.ecr.ap-southeast-1.amazonaws.com
set AWS_REGION=ap-southeast-1
set ECS_CLUSTER=smart-itinerary
set ROOT=%~dp0

echo.
echo == 0/6 checks
docker info >nul 2>&1
if errorlevel 1 (echo !! Docker daemon not reachable - start Docker Desktop and retry & exit /b 1)
aws sts get-caller-identity >nul 2>&1
if errorlevel 1 (echo !! AWS credentials not working - check %USERPROFILE%\.aws\credentials & exit /b 1)
echo    checks ok

echo.
echo == 1/6 terraform apply (MQ recreate is the 20-30 min tail - do not cancel)
cd /d "%ROOT%infra\terraform"
terraform plan -out=tfplan.bin -no-color > "%TEMP%\plan-demo.log" 2>&1
if errorlevel 1 (echo !! PLAN FAILED & type "%TEMP%\plan-demo.log" & exit /b 1)
terraform show -no-color tfplan.bin | findstr /C:"aws_mq_broker" | findstr /C:"will be replaced" >nul 2>&1
if not errorlevel 1 (echo !! MQ broker replacement detected in plan - aborting for review & exit /b 1)
terraform apply -auto-approve -no-color tfplan.bin > "%TEMP%\apply-demo.log" 2>&1
if errorlevel 1 (echo !! APPLY FAILED & type "%TEMP%\apply-demo.log" & exit /b 1)
findstr /C:"Apply complete" "%TEMP%\apply-demo.log"
del tfplan.bin

echo.
echo == 2/6 build + push 8 images (linux/amd64)
aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %REGISTRY% >nul
if errorlevel 1 (echo !! ECR login failed & exit /b 1)
docker build --platform linux/amd64 -f .context\ddl-loader\Dockerfile -t %REGISTRY%\tools-service:ddl-loader . || exit /b 1
docker push %REGISTRY%\tools-service:ddl-loader || exit /b 1
echo    pushed ddl-loader
for %%s in (gateway auth-service itinerary-service gemini-service tools-service email-service) do (
  docker build --platform linux/amd64 -f services\%%s\Dockerfile -t %REGISTRY%\%%s:latest . || exit /b 1
  docker push %REGISTRY%\%%s:latest || exit /b 1
  echo    pushed %%s
)
docker build --platform linux/amd64 -f apps\web\Dockerfile -t %REGISTRY%\web:latest . || exit /b 1
docker push %REGISTRY%\web:latest || exit /b 1
echo    pushed web

echo.
echo == 3/6 DDL load x4 (cross-platform helper)
cd /d "%ROOT%"
python scripts\ddl-stage.py
if errorlevel 1 (echo !! DDL FAILED & exit /b 1)

echo.
echo == 4/6 force-rollout x7
cd /d "%ROOT%infra\terraform"
for %%s in (email-service auth-service itinerary-service gemini-service tools-service gateway web) do (
  echo    %%s rolling...
  aws ecs update-service --cluster %ECS_CLUSTER% --service %%s --force-new-deployment >nul
  aws ecs wait services-stable --cluster %ECS_CLUSTER% --services %%s
  if errorlevel 1 (echo !! %%s did not reach steady state & exit /b 1)
  echo    %%s stable
)

echo.
echo == 5/6 verify
for /f "delims=" %%u in ('terraform output -raw web_public_url') do set URL=%%u
echo    URL: https://%URL%
start "" "https://%URL%"
curl -s -o nul -w "    homepage: HTTP %%{http_code} (%%{time_total}s)" --max-time 25 "https://%URL%/"
echo.
curl -s --max-time 15 "https://%URL%/healthz"
echo.
curl -s -o nul -w "    sign-in route: HTTP %%{http_code}" --max-time 15 "https://%URL%/auth/start"
echo.

echo.
echo == 6/6 reminder - the Cognito client id changed this cycle
cd /d "%ROOT%infra\terraform"
for /f "delims=" %%c in ('terraform output -raw cognito_web_client_id') do set NEW_CLIENT=%%c
echo    new client id: %NEW_CLIENT%
echo    refresh COGNITO_CLIENT_ID in the local .env + apps/web/.env, then
echo    restart the local containers + dev server for localhost login.
echo.
echo RESTART_COMPLETE
