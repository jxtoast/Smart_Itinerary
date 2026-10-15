#!/usr/bin/env python3
"""RabbitMQ queue-viewer — runs a throwaway ECS task that queries the
broker's management API from INSIDE the VPC and prints the live queue
table. The demo-day replacement for the web console (decision T4.14: the
broker stays private, "only tasks can reach the broker" stays true).

Same staging discipline as ddl-stage.py:

  1. reads the broker/AMQP_URL secret ARN        (terraform output)
  2. reads the execution role                    (aws iam get-role)
  3. reads the network config                    (aws ecs describe-services gateway)
  4. registers + runs ONE throwaway task         (tools-service:mq-viewer)
  5. waits for STOPPED, verifies exit code 0
  6. pulls the task's CloudWatch lines and formats the queue table

The task command parses the amqps:// URL with busybox sh string ops — the
broker credentials never leave the Secrets Manager slot (they arrive as a
task secret, not plaintext task-def JSON). The broker SG admits the
management API (443) from the services ring only — internet-invisible.
"""

import json
import os
import subprocess
import sys
import time

REGION = "ap-southeast-1"
CLUSTER = "smart-itinerary"
EXEC_ROLE = "smart-itinerary-ecs-execution"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TFDIR = os.path.join(ROOT, "infra", "terraform")
OUTDIR = os.path.join(ROOT, ".context", "mq-viewer")
REGISTRY = "134580877391.dkr.ecr.ap-southeast-1.amazonaws.com"
LOG_GROUP = f"/ecs/{CLUSTER}/tools-service"


def sh(cmd, cwd=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip()


def die(msg):
    print(f"!! QUEUE-VIEWER FAILED: {msg}")
    sys.exit(1)


def main():
    os.makedirs(OUTDIR, exist_ok=True)

    # 1. the AMQP_URL secret ARN (always fresh from Terraform state)
    ok, out = sh(["terraform", "output", "-json", "secret_arns"], cwd=TFDIR)
    if not ok:
        die(f"terraform output secret_arns failed:\n{out}")
    arns = json.loads(out)
    if "broker/AMQP_URL" not in arns:
        die("secret_arns has no broker/AMQP_URL — is the stack applied?")

    # 2. execution role
    ok, role = sh(["aws", "iam", "get-role", "--role-name", EXEC_ROLE,
                   "--query", "Role.Arn", "--output", "text"])
    if not ok:
        die(f"aws iam get-role failed:\n{role}")

    # 3. network config (the services ring — the only source the broker SG admits)
    ok, net_json = sh(["aws", "ecs", "describe-services", "--cluster", CLUSTER,
                       "--services", "gateway", "--region", REGION,
                       "--query", "services[0].networkConfiguration.awsvpcConfiguration",
                       "--output", "json"])
    if not ok or not net_json.strip():
        die("aws ecs describe-services returned nothing — is the stack applied?")
    netcfg = json.loads(net_json)
    subs = ",".join(netcfg["subnets"])
    sgs = ",".join(netcfg["securityGroups"])
    net = (f"awsvpcConfiguration={{subnets=[{subs}],"
           f"securityGroups=[{sgs}],assignPublicIp=ENABLED}}")

    # 4. stage + register the task. The sh parse: amqps://user:pass@host:5671
    #    → curl -u user:pass https://host/api/... (management API is on 443).
    td = {
        "family": "smart-itinerary-mq-viewer",
        "requiresCompatibilities": ["FARGATE"],
        "networkMode": "awsvpc",
        "cpu": "256",
        "memory": "512",
        "executionRoleArn": role,
        "containerDefinitions": [{
            "name": "mq-viewer",
            "image": f"{REGISTRY}/tools-service:mq-viewer",
            "essential": True,
            "command": ["sh", "-ec",
                        ('A="${AMQP_URL#amqps://}"; UP="${A%%@*}"; '
                         'H="${A#*@}"; HOST="${H%%:*}"; '
                         'curl -sf -u "$UP" "https://$HOST/api/overview" | head -c 20000; echo; '
                         'curl -sf -u "$UP" "https://$HOST/api/queues" '
                         '&& { echo; echo MQ_VIEWER_OK; }')],
            "secrets": [{"name": "AMQP_URL", "valueFrom": arns["broker/AMQP_URL"]}],
            "logConfiguration": {"logDriver": "awslogs", "options": {
                "awslogs-group": LOG_GROUP,
                "awslogs-region": REGION,
                "awslogs-stream-prefix": "mq-viewer"}},
        }],
    }
    td_path = os.path.join(OUTDIR, "td-mq-viewer.json")
    with open(td_path, "w") as f:
        json.dump(td, f)

    ok, rev = sh(["aws", "ecs", "register-task-definition",
                  "--cli-input-json", f"file://{td_path}",
                  "--query", "taskDefinition.taskDefinitionArn",
                  "--output", "text"])
    if not ok:
        die(f"register-task-definition failed:\n{rev}")

    # 5. run + wait
    ok, task = sh(["aws", "ecs", "run-task", "--cluster", CLUSTER,
                   "--task-definition", rev, "--launch-type", "FARGATE",
                   "--network-configuration", net,
                   "--query", "tasks[0].taskArn", "--output", "text"])
    if not ok:
        die(f"run-task failed:\n{task}")
    print(f"mq-viewer task: {task.split('/')[-1]} — querying the broker in-VPC…")

    while True:
        ok, state = sh(["aws", "ecs", "describe-tasks", "--cluster", CLUSTER,
                        "--tasks", task, "--region", REGION,
                        "--query", "tasks[0].lastStatus", "--output", "text"])
        state = state.strip() if ok else ""
        if state in ("STOPPED", ""):
            break
        time.sleep(4)

    ok, exit_code = sh(["aws", "ecs", "describe-tasks", "--cluster", CLUSTER,
                        "--tasks", task, "--region", REGION,
                        "--query", "tasks[0].containers[0].exitCode",
                        "--output", "text"])
    code = exit_code.strip() if ok else "?"
    if code != "0":
        die(f"viewer task exit={code} — broker unreachable or creds rejected; "
            f"logs: {LOG_GROUP}, stream prefix mq-viewer")

    # 6. fetch the task's output lines and format
    ok, streams_json = sh(["aws", "logs", "describe-log-streams",
                           "--log-group-name", LOG_GROUP, "--region", REGION,
                           "--log-stream-name-prefix", "mq-viewer",
                           "--output", "json"])
    if not ok or not streams_json.strip():
        die("no mq-viewer log stream found")
    # newest mq-viewer stream, client-side (the CLI refuses
    # logStreamNamePrefix together with order-by LastEventTime)
    streams = json.loads(streams_json)["logStreams"]
    if not streams:
        die("no mq-viewer log stream found")
    stream = max(streams, key=lambda s: s["lastEventTimestamp"])["logStreamName"]
    ok, out = sh(["aws", "logs", "get-log-events",
                  "--log-group-name", LOG_GROUP, "--log-stream-name", stream,
                  "--region", REGION, "--limit", "30",
                  "--query", "events[].message", "--output", "json"])
    if not ok:
        die(f"get-log-events failed:\n{out}")

    overview, queues = None, []
    for line in json.loads(out):
        line = line.strip()
        if not (line.startswith("{") or line.startswith("[")):
            continue
        # curl emits no trailing newline, so the MQ_VIEWER_OK marker can be
        # concatenated onto the JSON line by the logging driver — strip it
        try:
            obj = json.loads(line.replace("MQ_VIEWER_OK", "").strip())
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "rabbitmq_version" in obj:
            overview = obj
        elif isinstance(obj, list):
            queues = obj

    if overview:
        print(f"broker: RabbitMQ {overview['rabbitmq_version']} "
              f"(management {overview.get('management_version', '?')})")
    if not queues:
        print("no queues yet — services assert the topology on startup")
        return

    print(f"{'queue':<28}{'ready':>7}{'unacked':>9}{'consumers':>11}")
    print("-" * 55)
    for q in sorted(queues, key=lambda x: x["name"]):
        print(f"{q['name']:<28}{q['messages_ready']:>7}"
              f"{q['messages_unacknowledged']:>9}{q['consumers']:>11}")
    print("-" * 55)
    print("reminder flow: reminders.waiting holds parked TTL messages "
          "(ready>0, no consumers) until the broker dead-letters them into "
          "reminders.due — consumed by email-service → SES")


if __name__ == "__main__":
    main()
