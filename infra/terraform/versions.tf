terraform {
  required_version = ">= 1.5.0"

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
