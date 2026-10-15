#!/usr/bin/env python3
"""Rewrite mq_console_ingress_cidrs in terraform.tfvars to this machine's
current public IP. Run it whenever you switch networks (home WiFi <-> phone
hotspot) before opening the RabbitMQ web console.

Only the tfvars edit lives here; the plan/replacement-guard/apply sequence
stays in the refresh-console-ip.sh / .bat wrappers so the "refuse if the
plan wants to replace infrastructure" rule exists in one reviewable place.
"""

import re
import sys
import urllib.request
from pathlib import Path


def main() -> None:
    tfvars = (
        Path(__file__).resolve().parent.parent / "infra" / "terraform" / "terraform.tfvars"
    )
    try:
        ip = (
            urllib.request.urlopen("https://checkip.amazonaws.com", timeout=10)
            .read()
            .decode()
            .strip()
        )
    except OSError as exc:
        sys.exit(f"!! could not fetch the public IP: {exc}")
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", ip):
        sys.exit(f"!! unexpected IP response: {ip!r}")

    text = tfvars.read_text()
    line = f'mq_console_ingress_cidrs = ["{ip}/32"]'
    if "mq_console_ingress_cidrs" in text:
        text, count = re.subn(r"mq_console_ingress_cidrs\s*=\s*\[[^\]]*\]", line, text)
        if count != 1:
            sys.exit(f"!! expected exactly one cidrs line, matched {count}")
    else:
        text += f"\n{line}\n"
    tfvars.write_text(text)
    print(f"  tfvars allowlist -> {ip}/32")


if __name__ == "__main__":
    main()
