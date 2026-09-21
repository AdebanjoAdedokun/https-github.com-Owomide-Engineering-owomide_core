resource "vultr_kubernetes" "owomide" {
  region  = var.region
  label   = var.cluster_name
  version = var.k8s_version

  # Standard (non-HA) control plane — free. HA adds ~$40-50/mo, not needed
  # for a testing-phase cluster.
  node_pools {
    node_quantity = var.node_count
    plan          = var.node_plan
    label         = "${var.cluster_name}-pool"
  }
}
