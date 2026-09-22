terraform {
  required_version = ">= 1.5.0"

  # State only — the Terraform Cloud workspace's Execution Mode is set to
  # "Local", so plan/apply still run on the GitHub Actions runner as before.
  # This just gives state a persistent home so a second `apply` run doesn't
  # try to recreate the cluster.
  cloud {
    organization = "Owomide"

    workspaces {
      name = "owomide-vultr"
    }
  }

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = ">= 2.0.0, < 3.0.0"
    }
  }
}

provider "vultr" {
  api_key = var.vultr_api_key
}
