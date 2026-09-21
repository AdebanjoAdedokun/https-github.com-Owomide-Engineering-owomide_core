variable "vultr_api_key" {
  description = "Vultr API key (Account > API in the Vultr control panel). Set via TF_VAR_vultr_api_key — never commit it."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Vultr region code (e.g. lhr = London, jnb = Johannesburg). Pick whichever benchmarks lowest latency to Nigeria."
  type        = string
  default     = "lhr"
}

variable "cluster_name" {
  description = "Label for the VKE cluster."
  type        = string
  default     = "owomide-staging"
}

variable "k8s_version" {
  description = "Kubernetes version string as reported by `vultr-cli kubernetes versions-list`."
  type        = string
  # Confirmed against `vultr-cli kubernetes versions-list` on 2026-09-20.
  default = "v1.37.0+1"
}

variable "node_plan" {
  description = "Vultr Cloud Compute plan ID for worker nodes."
  type        = string
  default     = "vc2-2c-4gb" # 2 vCPU / 4GB, ~$20/mo
}

variable "node_count" {
  description = "Number of worker nodes in the single node pool."
  type        = number
  default     = 1
}
