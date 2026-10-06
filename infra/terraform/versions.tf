# Terraform for the Smart Itinerary AWS stack (the diagram's right half).
# The lead runs it by hand — CI's gate stays `terraform validate` (via
# `init -backend=false`, which skips the remote state bucket). README.md has
# the apply order, the demo-rhythm cost table and the teardown runbook.

terraform {
  # >= 1.10 for the S3 backend's native lockfile (use_lockfile) — no DynamoDB
  # table needed for state locking.
  required_version = ">= 1.10"

  # Remote state in S3: the demo rhythm (apply → demo → destroy) makes state
  # loss the top billed-resource hazard — a lost local statefile with live
  # resources means orphans nothing can destroy. The bucket is created
  # OUT OF BAND before the first `terraform init` (a backend cannot create
  # its own bucket):
  #   aws s3api create-bucket --bucket smart-itinerary-tfstate-<suffix> \
  #     --region ap-southeast-1 --create-bucket-configuration LocationConstraint=ap-southeast-1
  #   aws s3api put-bucket-versioning --bucket <bucket> \
  #     --versioning-configuration Status=Enabled
  # Versioning doubles as state history; default SSE protects the secrets
  # state inevitably contains. Adjust bucket + region here to match.
  backend "s3" {
    bucket       = "smart-itinerary-tfstate-terry12321"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
  }

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
