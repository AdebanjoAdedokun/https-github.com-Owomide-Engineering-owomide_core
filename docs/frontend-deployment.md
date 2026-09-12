# Frontend deployment

For the current static sample hosting, see [Cloudflare Workers builds and
previews](cloudflare-workers-preview.md). The sections below describe the
separate Kubernetes/container release path, not a claim that the live backend
integration is already deployed.

The marketing site and authenticated workspace live in one repository but ship
as separate static containers. Both containers run unprivileged on port `8080`;
Kubernetes exposes them internally on Service port `80`.

## Public routing

| Request | Kubernetes destination |
| --- | --- |
| `https://owomide.com/*` | `marketing:80` |
| `https://app.owomide.com/api/*` | `gateway:5000` |
| `https://app.owomide.com/*` | `workspace:80` |

Keeping `/api` on the workspace origin avoids a browser CORS boundary and makes
secure session cookies straightforward. The marketing login link points to
`https://app.owomide.com/#/login?returnTo=%2Fwork`; logout ends the session and
returns to `https://owomide.com`.

The base Ingress intentionally contains `.invalid` hosts and a
`replace-me-tls` secret. Environment overlays replace every placeholder:

- local: `owomide.local` and `app.owomide.local`, HTTP only;
- staging: `staging.owomide.com` and `app-staging.owomide.com`;
- production: `owomide.com` and `app.owomide.com`.

## Cloudflare and TLS

Cloudflare should proxy the production DNS records to the public address of the
Kubernetes NGINX Ingress controller. Use **Full (strict)** TLS. Provision the
origin certificate outside Git, then create the referenced `kubernetes.io/tls`
Secret (`owomide-staging-tls` or `owomide-production-tls`) in the target
namespace. A cert-manager issuer or a sealed external-secret workflow is also
valid; plaintext key material must never be committed.

The cluster must have an NGINX Ingress controller before applying these
manifests. A Cloudflare redirect rule can canonicalize `www.owomide.com` to the
apex without adding another application Deployment.

## Immutable images and promotion

Build both images once for a commit and push them to GHCR:

- `ghcr.io/owomide-engineering/owomide-marketing`
- `ghcr.io/owomide-engineering/owomide-workspace`

Tagging an image `sha-<git-sha>` is useful for humans, but deployment should pin
the registry digest. The `sha-000000000000` values in the remote overlays are
deliberately non-release placeholders. The release job must replace them before
`kubectl apply`, for example:

```sh
cd infra/k8s/overlays/staging/frontend
kustomize edit set image \
  owomide/marketing=ghcr.io/owomide-engineering/owomide-marketing@sha256:${MARKETING_DIGEST} \
  owomide/workspace=ghcr.io/owomide-engineering/owomide-workspace@sha256:${WORKSPACE_DIGEST}
```

The intended release flow is:

1. A merge to `main` runs CI. When the repository variable
   `ENABLE_STAGING_DEPLOY=true`, the successful `Deploy frontends to staging`
   workflow builds both images, pushes them to GHCR, patches the staging overlay
   to the resulting digests, and deploys it. The privileged workflow accepts
   only a successful trusted `push` CI run from this repository's `main` branch
   (or an explicit manual run on `main`), never pull-request code.
2. Smoke-test the landing page, login, an authenticated workspace route,
   `/api/health`, logout, and SPA deep-link refreshes.
3. Record the staging workflow's source SHA and two `sha256:` digests. Supply
   those exact values to `Promote frontends to production`; its protected
   production environment provides the manual approval. Production checks out
   and verifies the matching full 40-character source revision and does not
   rebuild images.
4. Confirm both rollouts and retain the prior ReplicaSets for rollback.

The frontend workflows apply only the dedicated `staging/frontend` and
`prod/frontend` overlays. They cannot overwrite backend Deployments, data
stores or Secrets. The full environment overlays remain a separate platform
release boundary.

Local images use `imagePullPolicy: Never`; staging and production use
`IfNotPresent` with immutable digests. Production runs two replicas of each
frontend for rolling availability.

## Secrets and deployment credentials

Create or inject these outside the repository:

- `ghcr-pull`, a registry pull Secret when the GHCR packages are private;
- `owomide-staging-tls` and `owomide-production-tls`;
- the existing service Secrets referenced by Gateway, Catalog, Data Pipeline,
  and Margin in each remote namespace;
- GitHub environment credentials for GHCR and cluster deployment (prefer OIDC
  or a narrowly scoped deploy identity over a long-lived kubeconfig);
- a Cloudflare API token only if DNS or certificates are automated.

The credentials currently present in base/local manifests are development
fixtures. Before the first remote deployment, externalize the Gateway JWT,
Postgres, MinIO, database, and service-to-service credentials and set the
production Gateway origin/auth policy explicitly. Do not promote development
defaults to staging or production.

The Ingress includes the future same-origin `/api` route, so enabling a remote
frontend deployment also makes the existing Gateway reachable on the workspace
host. Treat Gateway credential externalization, restrictive CORS/origin policy,
dependency remediation and the live-adapter release gate as mandatory before
enabling `ENABLE_STAGING_DEPLOY`; the fixture UI being safe does not make a
development Gateway safe to expose.

The checked-in workflows currently expect a base64-encoded kubeconfig named
`KUBECONFIG_BASE64` in both the `staging` and `production` GitHub Environments.
Protect the production Environment with required reviewers. The staging job is
disabled until `ENABLE_STAGING_DEPLOY` is explicitly set to `true`.

## Validation and operations

Validate every rendered environment before applying it:

```sh
kustomize build infra/k8s/overlays/local | kubeconform -strict -summary
kustomize build infra/k8s/overlays/staging | kubeconform -strict -summary
kustomize build infra/k8s/overlays/staging/frontend | kubeconform -strict -summary
kustomize build infra/k8s/overlays/prod | kubeconform -strict -summary
kustomize build infra/k8s/overlays/prod/frontend | kubeconform -strict -summary
```

For a local Ingress, map `owomide.local` and `app.owomide.local` to the local
Ingress address. For a rollout or rollback:

```sh
kubectl rollout status deployment/marketing
kubectl rollout status deployment/workspace
kubectl rollout undo deployment/workspace
```
