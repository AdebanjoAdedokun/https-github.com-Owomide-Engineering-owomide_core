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

.PHONY: gateway-dev
gateway-dev: ## Run gateway in dev mode with hot reload
	cd src/gateway && JWT_SECRET=dev-secret-for-local-testing-only pnpm dev

.PHONY: gateway-test
gateway-test: ## Run gateway unit tests
	cd src/gateway && pnpm test

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
migrate: ## Apply pending migrations [svc=<name> for one service] [F0.6]
	@cd tools/scripts/migrate && pnpm run migrate apply $(if $(svc),--svc $(svc),)

.PHONY: migrate-down
migrate-down: ## Roll back migrations — svc=<name> required, steps=N optional (default 1) [F0.6]
	@[ -n "$(svc)" ] || (echo "Error: svc= is required. Usage: make migrate-down svc=catalog [steps=2]"; exit 1)
	@cd tools/scripts/migrate && pnpm run migrate down --svc $(svc) $(if $(steps),--steps $(steps),)

.PHONY: migrate-create
migrate-create: ## Scaffold a new migration (usage: make migrate-create svc=<name> name=<desc>) [F0.6]
	@[ -n "$(svc)" ] || (echo "Error: svc= is required"; exit 1)
	@[ -n "$(name)" ] || (echo "Error: name= is required"; exit 1)
	@cd tools/scripts/migrate && pnpm run migrate create --svc $(svc) --name "$(name)"

.PHONY: bus-test
bus-test: ## Run all bus library tests (JS, Python, Go)
	cd src/lib/bus/js && pnpm test
	cd src/lib/bus/py && python -m pytest owomide_bus/tests/ -v
	cd src/lib/bus/go && go test ./...

.PHONY: bus-interop-test
bus-interop-test: ## Run cross-language bus interop test
	src/lib/bus/tests/interop.sh

.PHONY: proto
proto: ## Generate protobuf stubs (TypeScript, Python, Go)
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
