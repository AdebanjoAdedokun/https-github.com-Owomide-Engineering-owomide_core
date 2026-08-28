.DEFAULT_GOAL := help

# --- Working targets ---

.PHONY: build
build: ## Build all targets
	bazel build //...

.PHONY: bootstrap
bootstrap: ## Install local dev tooling (macOS: Homebrew + mise + OrbStack)
	tools/dev/bootstrap.sh

.PHONY: test
test: ## Run all tests
	bazel test //...

.PHONY: frontends-build
frontends-build: ## Build the marketing and workspace applications
	pnpm build:frontends

.PHONY: frontends-test
frontends-test: ## Run the marketing and workspace test suites
	pnpm test:frontends

.PHONY: marketing-dev
marketing-dev: ## Run the public marketing site on localhost:4173
	pnpm dev:marketing

.PHONY: workspace-dev
workspace-dev: ## Run the authenticated workspace on localhost:4174
	pnpm dev:workspace

.PHONY: lint
lint: ## Run linters (TS, Python, Go — skips languages with no implementation yet)
	cd src/gateway && pnpm eslint "src/**/*.ts"
	cd src/catalog && pnpm eslint "src/**/*.ts"
	ruff check src/data-pipeline/owomide_data_pipeline src/data-pipeline/tests
	@if find src -name "main.py" | grep -q .; then ruff check src --exclude src/data-pipeline; fi
	@find src -maxdepth 2 -name "go.mod" -not -path "*/lib/*" -exec dirname {} \; | while IFS= read -r dir; do (cd "$$dir" && golangci-lint run ./...); done

.PHONY: fmt
fmt: ## Auto-format code (skips languages with no implementation yet)
	cd src/gateway && pnpm prettier --write "src/**/*.ts"
	cd src/catalog && pnpm prettier --write "src/**/*.ts"
	ruff format src/data-pipeline/owomide_data_pipeline src/data-pipeline/tests
	@if find src -name "main.py" | grep -q .; then ruff format src --exclude src/data-pipeline; fi
	@if find src -name "main.go" | grep -q .; then gofmt -w src; fi

.PHONY: gateway-dev
gateway-dev: ## Run gateway in dev mode with hot reload
	cd src/gateway && JWT_SECRET=dev-secret-for-local-testing-only pnpm dev

.PHONY: gateway-test
gateway-test: ## Run gateway unit tests
	cd src/gateway && pnpm test

.PHONY: catalog-test
catalog-test: ## Run Catalog unit and PostgreSQL integration tests
	cd src/catalog && pnpm test
	cd src/catalog && pnpm test:integration

.PHONY: data-pipeline-test
data-pipeline-test: ## Run Data Pipeline unit tests
	bazel test //src/data-pipeline/... --test_tag_filters=-requires-docker

.PHONY: data-pipeline-integration-test
data-pipeline-integration-test: ## Run Data Pipeline PostgreSQL integration tests (requires Docker)
	bazel test \
		//src/data-pipeline:migration_integration_test \
		//src/data-pipeline:import_integration_test \
		--test_output=errors

.PHONY: data-pipeline-acceptance-test
data-pipeline-acceptance-test: ## Run the service-stack acceptance suite (requires Docker)
	python3 src/data-pipeline/tests/system/acceptance.py

.PHONY: margin-test
margin-test: ## Run Margin unit and PostgreSQL integration tests (requires Docker)
	cd src/margin && go test ./...

# --- Stubbed targets (F0.2+) ---

.PHONY: dev
dev: ## Start local dev stack (OrbStack k8s + Skaffold) [F0.2]
	kubectl config use-context orbstack
	skaffold dev

.PHONY: dev-infra
dev-infra: ## Start infra only (Postgres, Redis, MinIO, Kafka) — no gateway [F0.2]
	kubectl config use-context orbstack
	skaffold dev -p infra-only

.PHONY: dev-down
dev-down: ## Tear down deployed resources from OrbStack k8s [F0.2]
	skaffold delete

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

.PHONY: bus-smoke-test
bus-smoke-test: ## Verify local Kafka bus smoke publisher -> subscriber delivery [F0.9]
	tools/scripts/bus-smoke-test.sh

.PHONY: proto
proto: ## Generate protobuf stubs (TypeScript, Python, Go)
	cd src/lib/proto && buf generate

.PHONY: gazelle
gazelle: ## Auto-generate BUILD.bazel files
	bazel run //:gazelle

.PHONY: manifests-validate
manifests-validate: ## Validate k8s manifests (kubeconform strict) [F0.2/F0.7]
	kustomize build infra/k8s/overlays/local | kubeconform -strict -summary
	kustomize build infra/k8s/overlays/staging | kubeconform -strict -summary
	kustomize build infra/k8s/overlays/prod | kubeconform -strict -summary

# --- Help ---

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
