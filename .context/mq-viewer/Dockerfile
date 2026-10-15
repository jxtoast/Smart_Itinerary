# RabbitMQ queue-viewer — the image behind scripts/broker-queues.py's
# throwaway ECS task (the ddl-loader pattern, read-only cousin).
#
# Pure curl on purpose: the TASK command parses the amqps:// URL (busybox sh
# string ops) and prints the management-API JSON to stdout → CloudWatch; the
# HOST formats the table. Nothing custom to maintain, no credentials beyond
# the AMQP_URL secret the task already reads.
#
# Built --platform linux/amd64 (the Fargate rule) and pushed to ECR as
# tools-service:mq-viewer — this stack's Fargate tasks only pull from ECR.
FROM curlimages/curl:8.12.1
