@echo off
REM Refresh the RabbitMQ web-console allowlist to THIS machine's current
REM public IP and apply (SG-only, in-place, ~30 s). Run it whenever you
REM switch networks before opening the console. macOS/Linux: .sh twin.
REM Safety: refuses to apply if the plan contains any resource replacement.

setlocal
set "ROOT=%~dp0.."

python "%ROOT%\scripts\refresh-console-ip.py"
if errorlevel 1 exit /b 1

cd /d "%ROOT%\infra\terraform"
terraform plan -no-color -out=console-ip-plan.bin > "%TEMP%\console-ip-plan.log" 2>&1
if errorlevel 1 (echo !! PLAN FAILED & type "%TEMP%\console-ip-plan.log" & exit /b 1)
findstr /C:"be replaced" "%TEMP%\console-ip-plan.log" >nul 2>&1
if not errorlevel 1 (
  echo !! plan contains resource REPLACEMENTS - not just the SG rule. Aborting.
  exit /b 1
)
terraform apply -auto-approve -no-color console-ip-plan.bin > "%TEMP%\console-ip-apply.log" 2>&1
if errorlevel 1 (echo !! APPLY FAILED & type "%TEMP%\console-ip-apply.log" & exit /b 1)
findstr /C:"Apply complete" "%TEMP%\console-ip-apply.log"
del console-ip-plan.bin
echo   open the console URL from: aws mq describe-broker --broker-id smart-itinerary-rabbitmq --query "Instances[0].Endpoints" --output text
