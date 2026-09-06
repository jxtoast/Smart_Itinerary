# Cognito module for the Smart Itinerary auth stack (diagram: "Amazon Cognito").
# A reusable module of the infra/terraform root stack — the root module
# configures the provider; this file only declares what the module needs.
# The whole stack is checked in for review and is NEVER applied by CI or the
# compose stack — see ../../README.md and RUNBOOK.md for the by-hand walkthrough.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
