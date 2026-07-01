#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Owomide bootstrap currently supports macOS only."
  echo "Install the tools in .mise.toml plus kubectl, skaffold, kustomize, kubeconform, buf, bazelisk, ruff, and golangci-lint."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh, then re-run this script."
  exit 1
fi

echo "==> Installing macOS packages"
brew update
brew install \
  bazelisk \
  bufbuild/buf/buf \
  golangci-lint \
  kubeconform \
  kubectl \
  kustomize \
  mise \
  ruff \
  skaffold

if ! brew list --cask orbstack >/dev/null 2>&1; then
  brew install --cask orbstack
fi

echo "==> Installing pinned runtimes from .mise.toml"
cd "$ROOT_DIR"
mise trust "$ROOT_DIR/.mise.toml" >/dev/null 2>&1 || true
mise install

echo "==> Installing workspace Node dependencies"
mise exec -- pnpm install --frozen-lockfile

echo "==> Verifying toolchain"
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- python --version
mise exec -- go version
bazelisk version | sed -n '1,2p'
kubectl version --client=true
skaffold version
kustomize version
kubeconform -v
buf --version

cat <<'EOF'

Bootstrap complete.

Next:
  1. Open OrbStack and enable Kubernetes: Settings -> Kubernetes -> Enable.
  2. Run: kubectl config use-context orbstack
  3. Run: make dev

Tip: activate mise in your shell so node, pnpm, python, and go resolve to the pinned repo versions.
See: https://mise.jdx.dev/getting-started.html
EOF
