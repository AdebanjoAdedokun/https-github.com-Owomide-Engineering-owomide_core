output "cluster_id" {
  value = vultr_kubernetes.owomide.id
}

output "cluster_endpoint" {
  value = vultr_kubernetes.owomide.endpoint
}

# Base64-encoded kubeconfig. Decode with:
#   terraform output -raw kube_config | base64 -d > kubeconfig.yaml
output "kube_config" {
  value     = vultr_kubernetes.owomide.kube_config
  sensitive = true
}
