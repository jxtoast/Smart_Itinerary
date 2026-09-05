# Terraform for the Smart Itinerary auth stack (diagram: "Amazon Cognito").
# This code is checked in for review and is NEVER applied by CI or the compose
# stack — the lead runs `terraform apply` once by hand when a real pool is
# wanted. See RUNBOOK.md for the full walkthrough and teardown.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
