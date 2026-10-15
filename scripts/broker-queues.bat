@echo off
REM RabbitMQ queue-viewer - live queue table from INSIDE the VPC.
REM macOS/Linux: broker-queues.sh
setlocal
set "ROOT=%~dp0.."
aws ecr describe-images --repository-name tools-service --image-ids imageTag=mq-viewer --region ap-southeast-1 >nul 2>&1
if errorlevel 1 (
  echo   image tools-service:mq-viewer not in ECR - building ^(one-time per stack cycle^)...
  aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 134580877391.dkr.ecr.ap-southeast-1.amazonaws.com
  docker build --platform linux/amd64 -f "%ROOT%\.context\mq-viewer\Dockerfile" -t 134580877391.dkr.ecr.ap-southeast-1.amazonaws.com/tools-service:mq-viewer "%ROOT%"
  if errorlevel 1 (echo !! mq-viewer image build failed & exit /b 1)
  docker push 134580877391.dkr.ecr.ap-southeast-1.amazonaws.com/tools-service:mq-viewer
  if errorlevel 1 (echo !! mq-viewer push failed & exit /b 1)
)
python "%ROOT%\scripts\broker-queues.py"
