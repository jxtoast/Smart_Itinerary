# Terraform for the Smart Itinerary AWS scaffold (the diagram's right half).
# Checked in for review and NEVER applied by CI or the compose stack — the lead
# runs it by hand when a real deployment is wanted. README.md has the apply
# order and the cost estimate; `terraform validate` is the repo's CI-level gate.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # Used to generate the JWT dev secret and the RDS master passwords at
    # apply time, so this repo never contains a credential value.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# One provider for every module (modules declare requirements, they never
# configure providers). default_tags stamps every resource, so a forgotten
# demo stack is easy to find in the console and `terraform destroy` (README)
# sweeps it all in one go.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
