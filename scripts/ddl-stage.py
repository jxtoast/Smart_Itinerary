#!/usr/bin/env python3
"""DDL loader — stages and runs the 4 database-schema tasks on ECS.

Cross-platform helper used by deploy-demo.sh (macOS/Linux) and
deploy-demo.bat (Windows). Does, in order:

  1. reads the current DATABASE_URL secret ARNs   (terraform output)
  2. reads the execution role                     (aws iam get-role)
  3. reads the network config                     (aws ecs describe-services gateway)
  4. stages one task definition per database      (postgres:16 + psql + our DDL)
  5. runs each task, waits for it to stop, and verifies exit code 0

Notes baked in from the live cycles:
  - the task's psl command strips the node-only `uselibpqcompat` query
    parameter (real libpq psql rejects it) and re-appends a clean
    `?sslmode=require` — POSIX-safe, no bash-only substitution
  - subnets / security groups / secret ARNs change on every destroy+apply
    cycle, so they are ALWAYS re-read from the live state — never cached
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
OUTDIR = os.path.join(ROOT, ".context", "ddl-loader")
REGISTRY = "134580877391.dkr.ecr.ap-southeast-1.amazonaws.com"

DATABASES = [
    ("auth", "auth-service.sql", "auth-service/DATABASE_URL"),
    ("itinerary", "itinerary-service.sql", "itinerary-service/DATABASE_URL"),
    ("gemini", "gemini-service.sql", "gemini-service/DATABASE_URL"),
    ("tools", "tools-service.sql", "tools-service/DATABASE_URL"),
]


def sh(cmd, cwd=None):
    """Run a command, return (ok, stdout)."""
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip()


def die(msg):
    print(f"!! DDL FAILED: {msg}")
    sys.exit(1)


def main():
    os.makedirs(OUTDIR, exist_ok=True)

    # 1. current secret ARNs (from Terraform state — always fresh)
    ok, out = sh(["terraform", "output", "-json", "secret_arns"], cwd=TFDIR)
    if not ok:
        die(f"terraform output secret_arns failed:\n{out}")
    arns = json.loads(out)

    # 2. execution role
    ok, role = sh(["aws", "iam", "get-role", "--role-name", EXEC_ROLE,
                   "--query", "Role.Arn", "--output", "text"])
    if not ok:
        die(f"aws iam get-role failed:\n{role}")

    # 3. network config (from the gateway service — created by the apply)
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
    print(f"network: {net}")

    # 4. stage, register, run, verify — one task per database
    for name, sqlfile, key in DATABASES:
        td = {
            "family": f"smart-itinerary-ddl-{name}",
            "requiresCompatibilities": ["FARGATE"],
            "networkMode": "awsvpc",
            "cpu": "256",
            "memory": "512",
            "executionRoleArn": role,
            "containerDefinitions": [{
                "name": "ddl",
                "image": f"{REGISTRY}/tools-service:ddl-loader",
                "essential": True,
                # POSIX-safe: strip the whole query string, append a clean
                # libpq one (node-only `uselibpqcompat` breaks real psql)
                "command": ["sh", "-c",
                            (f'psql "${{DATABASE_URL%%\\?*}}?sslmode=require" '
                             f'-v ON_ERROR_STOP=1 -f /ddl/{sqlfile} '
                             f'&& echo DDL_OK_{name.upper()}')],
                "secrets": [{"name": "DATABASE_URL", "valueFrom": arns[key]}],
                "logConfiguration": {"logDriver": "awslogs", "options": {
                    "awslogs-group": f"/ecs/{CLUSTER}/tools-service",
                    "awslogs-region": REGION,
                    "awslogs-stream-prefix": "ddl"}},
            }],
        }
        td_path = os.path.join(OUTDIR, f"td-{name}.json")
        with open(td_path, "w") as f:
            json.dump(td, f)

        ok, rev = sh(["aws", "ecs", "register-task-definition",
                      "--cli-input-json", f"file://{td_path}",
                      "--query", "taskDefinition.taskDefinitionArn",
                      "--output", "text"])
        if not ok:
            die(f"register-task-definition failed for {name}:\n{rev}")

        ok, task = sh(["aws", "ecs", "run-task", "--cluster", CLUSTER,
                       "--task-definition", rev, "--launch-type", "FARGATE",
                       "--network-configuration", net,
                       "--query", "tasks[0].taskArn", "--output", "text"])
        if not ok:
            die(f"run-task failed for {name}:\n{task}")
        print(f"ddl-{name}: {task.split('/')[-1]}")

        while True:
            ok, state = sh(["aws", "ecs", "describe-tasks", "--cluster", CLUSTER,
                            "--tasks", task, "--region", REGION,
                            "--query", "tasks[0].lastStatus", "--output", "text"])
            state = state.strip() if ok else ""
            if state in ("STOPPED", ""):
                break
            time.sleep(5)

        ok, exit_code = sh(["aws", "ecs", "describe-tasks", "--cluster", CLUSTER,
                            "--tasks", task, "--region", REGION,
                            "--query", "tasks[0].containers[0].exitCode",
                            "--output", "text"])
        code = exit_code.strip() if ok else "?"
        print(f"ddl-{name} exit={code}")
        if code != "0":
            die(f"DDL failed for {name} — logs: /ecs/{CLUSTER}/tools-service, "
                f"stream prefix ddl")

    print("DDL_LOADED_ALL_4")


if __name__ == "__main__":
    main()
