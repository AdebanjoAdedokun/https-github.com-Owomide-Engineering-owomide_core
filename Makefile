.DEFAULT_GOAL := help

# --- Working targets ---

.PHONY: build
build: ## Build all targets
	bazel build //...

.PHONY: test
test: ## Run all tests
	bazel test //...

.PHONY: lint
lint: ## Run linters (TS, Python, Go)
	@echo "[lint] Not yet configured — will wire up ESLint, ruff, and golangci-lint in F0.7"

.PHONY: fmt
fmt: ## Auto-format code
	@echo "[fmt] Not yet configured — will wire up prettier, ruff format, and gofmt in F0.7"

# --- Stubbed targets (F0.2+) ---

.PHONY: dev
dev: ## Start local dev stack (minikube + Skaffold) [F0.2]
	@echo "[dev] Not yet implemented — see F0.2 in BUILD_PLAN.md"

.PHONY: dev-infra
dev-infra: ## Start infra only (Postgres, Redis, MinIO) [F0.2]
	@echo "[dev-infra] Not yet implemented — see F0.2 in BUILD_PLAN.md"

.PHONY: dev-down
dev-down: ## Tear down minikube cluster [F0.2]
	@echo "[dev-down] Not yet implemented — see F0.2 in BUILD_PLAN.md"

.PHONY: migrate
migrate: ## Apply pending migrations across all services [F0.6]
	@echo "[migrate] Not yet implemented — see F0.6 in BUILD_PLAN.md"

.PHONY: migrate-create
migrate-create: ## Create a new migration (usage: make migrate-create svc=<name> name=<desc>) [F0.6]
	@echo "[migrate-create] Not yet implemented — see F0.6 in BUILD_PLAN.md"

.PHONY: proto
proto: ## Generate TypeScript clients from protobuf definitions
	cd src/lib/proto && buf generate

.PHONY: gazelle
gazelle: ## Auto-generate BUILD.bazel files
	bazel run //:gazelle

.PHONY: manifests-validate
manifests-validate: ## Validate k8s manifests (kubeval + kustomize build) [F0.7]
	@echo "[manifests-validate] Not yet implemented — see F0.7 in BUILD_PLAN.md"

# --- Help ---

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
