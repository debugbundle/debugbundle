SHELL := /bin/sh

DEBUGBUNDLE_PROBE_TRIGGER_SECRET ?= $(shell sed -n 's/^DEBUGBUNDLE_PROBE_TRIGGER_SECRET=\(.*\)$$/\1/p' .env 2>/dev/null | head -n 1)
AWS_PROFILE ?= default
AWS_REGION ?= eu-central-1
AWS := AWS_PAGER="" aws --profile "$(AWS_PROFILE)" --region "$(AWS_REGION)" --no-cli-pager
DOCKER_COMPOSE ?= docker compose$(if $(wildcard .env), --env-file .env,)$(if $(wildcard .env.local), --env-file .env.local,)

NODE_IMAGE ?= node:24-alpine
WORKDIR := /workspace
COMPOSE_PROJECT ?= debugbundle
COMPOSE_NETWORK ?= $(COMPOSE_PROJECT)_default
INTEGRATION_PROJECT ?= debugbundle-integration
INTEGRATION_COMPOSE ?= docker compose -p $(INTEGRATION_PROJECT) -f deploy/selfhost/docker-compose.yml
INTEGRATION_NETWORK ?= $(INTEGRATION_PROJECT)_default
INTEGRATION_CONTAINER_PREFIX ?= debugbundle-integration
INTEGRATION_POSTGRES_PORT ?= 15432
INTEGRATION_REDIS_PORT ?= 16379
INTEGRATION_LOCALSTACK_PORT ?= 14566
INTEGRATION_API_PORT ?= 13000
INTEGRATION_WEB_PORT ?= 15291
INTEGRATION_APP_BASE_URL ?= http://localhost:$(INTEGRATION_WEB_PORT)
INTEGRATION_WEB_API_URL ?= http://localhost:$(INTEGRATION_API_PORT)
INTEGRATION_PROBE_TRIGGER_SECRET ?= debugbundle-selfhost-smoke-secret
S3_BUCKET ?= debugbundle-raw-events
WORKER_POLL_INTERVAL_MS ?= 1000
WORKER_RUN_ONCE ?= 0
PUBLIC_SITE_PORT ?= 5292
LEGACY_STORAGE_BOOTSTRAP_ERROR := storage_bootstrap_legacy_schema_detected
PARTIAL_STORAGE_BOOTSTRAP_ERROR := storage_bootstrap_partial_schema_detected

# Run Node/pnpm commands in a disposable Docker container to keep host clean.
NODE_RUN = docker run --rm -t \
	-v "$(PWD):$(WORKDIR)" \
	-w "$(WORKDIR)" \
	$(NODE_IMAGE) sh -lc
PNPM_INSTALL = corepack pnpm install --force
PNPM_INSTALL_RELAXED = $(PNPM_INSTALL) --frozen-lockfile=false

.PHONY: help
help:
	@echo "Common targets:"
	@echo "  make infra-up        Start local infra (postgres, redis, localstack, S3 bootstrap)"
	@echo "  make infra-bootstrap Create/migrate required DB tables and S3 bucket"
	@echo "  make infra-down      Stop local infra"
	@echo "  make infra-logs      Follow infra and S3 bootstrap logs"
	@echo "  make aws-whoami      Show the active AWS profile/account used for hosted work"
	@echo "  make aws-smoke-check Run non-mutating AWS access checks for hosted services"
	@echo "  make install         Install JS dependencies via Docker"
	@echo "  make lint            Run eslint via Docker"
	@echo "  make typecheck       Run TypeScript checks via Docker"
	@echo "  make web-check       Run focused web auth/account tests via Docker"
	@echo "  make load-check      Run noisy-ingestion load checks via Docker"
	@echo "  make perf-check      Run performance benchmark checks via Docker"
	@echo "  make test-unit       Run unit tests with coverage gates via Docker"
	@echo "  make test            Alias of test-unit"
	@echo "  make test-all        Run unit+coverage and integration tests"
	@echo "  make test-all-quick  Run unit (no coverage) and integration tests"
	@echo "  make selfhost-smoke  Boot the self-host stack and prove auth + ingest + bundle retrieval"
	@echo "  make build           Run build via Docker"
	@echo "  make ci              Run lint + typecheck + test + build via Docker"
	@echo "  make test-integration Run Compose-backed ingestion integration tests"
	@echo "  make api-check       Run API runtime bootstrap tests"
	@echo "  make backend-restart Recreate API + worker so they reload current env"
	@echo "  make dev             Start everything (infra + API + worker + web) and open http://localhost:5291"
	@echo "  make dev-public      Start the public-site dev server at http://localhost:5292"
	@echo "  make dev-down        Stop the full local dev stack"
	@echo "  make dev-reset       Drop local DB/cache/object-store state and rebuild from scratch"
	@echo "  make api-run         Start API with env-driven dependencies on compose network"
	@echo "  make worker-check    Run worker bootstrap/processor tests"
	@echo "  make worker-run      Start worker with env-driven dependencies on compose network"
	@echo "  make shell           Open a Node container shell in repo root"

.PHONY: infra-up
infra-up:
	$(DOCKER_COMPOSE) --profile dev up -d postgres redis localstack
	$(DOCKER_COMPOSE) --profile dev run --rm s3-bootstrap

.PHONY: ensure-probe-trigger-secret
ensure-probe-trigger-secret:
	@if [ -z "$(DEBUGBUNDLE_PROBE_TRIGGER_SECRET)" ]; then \
		echo "DEBUGBUNDLE_PROBE_TRIGGER_SECRET is required for API startup."; \
		echo "Set it in .env before running this target. Example:"; \
		echo "  cp .env.example .env"; \
		echo "  printf '\nDEBUGBUNDLE_PROBE_TRIGGER_SECRET=%s\n' \"$$(openssl rand -hex 32)\" >> .env"; \
		exit 1; \
	fi

.PHONY: infra-down
infra-down:
	$(DOCKER_COMPOSE) down

.PHONY: infra-logs
infra-logs:
	$(DOCKER_COMPOSE) logs -f postgres redis localstack s3-bootstrap

.PHONY: db-bootstrap
db-bootstrap: infra-up
	docker run --rm -t \
		--network "$(COMPOSE_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
			$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:bootstrap"

.PHONY: db-migrate
db-migrate: db-bootstrap
	docker run --rm -t \
		--network "$(COMPOSE_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
			$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:migrate"

.PHONY: s3-bootstrap
s3-bootstrap: infra-up
	@true

.PHONY: infra-bootstrap
infra-bootstrap: db-migrate s3-bootstrap

.PHONY: install
install:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL)"

.PHONY: lint
lint:
	$(NODE_RUN) "corepack enable && corepack pnpm lint"

.PHONY: typecheck
typecheck:
	$(NODE_RUN) "corepack enable && corepack pnpm typecheck"

.PHONY: web-check
web-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm vitest run tests/apps/web/web-app-auth.test.tsx tests/apps/web/web-app-management.test.tsx tests/apps/web/web-app-incidents.test.tsx tests/apps/web/web-dogfooding.test.ts && corepack pnpm typecheck"

.PHONY: perf-check
perf-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && node --import tsx scripts/perf-check.ts"

.PHONY: load-check
load-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && node --import tsx scripts/ingestion-load-check.ts"

.PHONY: test-unit
test-unit:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && BASE_SHA=$(BASE_SHA) HEAD_SHA=$(HEAD_SHA) corepack pnpm test"

.PHONY: test
test: test-unit

.PHONY: test-all
test-all:
	$(MAKE) test-unit
	$(MAKE) test-integration

.PHONY: test-all-quick
test-all-quick:
	$(NODE_RUN) "corepack enable && corepack pnpm vitest run"
	$(MAKE) test-integration

.PHONY: build
build:
	$(NODE_RUN) "corepack enable && corepack pnpm build"

.PHONY: ci
ci: lint typecheck test build

.PHONY: test-integration
test-integration:
	@set -e; \
	trap 'POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) down -v' EXIT; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) up -d postgres redis localstack; \
	docker run --rm -t \
		--network "$(INTEGRATION_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-e RUN_INTEGRATION=1 \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
		-e REDIS_URL=redis://redis:6379 \
		-e S3_ENDPOINT=http://localstack:4566 \
		-e S3_REGION=us-east-1 \
		-e S3_BUCKET=debugbundle-raw-events \
			$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:bootstrap && corepack pnpm db:migrate && corepack pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/integration/ingestion-core.integration.test.ts tests/integration/ingestion-bundle-triggers.integration.test.ts tests/integration/ingestion-replay-idempotency.integration.test.ts tests/integration/ingestion-lifecycle-webhooks.integration.test.ts tests/integration/billing-sync.integration.test.ts tests/integration/project-deletion.integration.test.ts tests/integration/retention-cleanup.integration.test.ts tests/integration/retention-sampling.integration.test.ts tests/integration/storage-migrations.integration.test.ts"

.PHONY: test-integration-down
test-integration-down:
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) down -v

.PHONY: selfhost-smoke
selfhost-smoke:
	@set -e; \
	chmod +x deploy/selfhost/localstack-init/01-create-bucket.sh; \
	trap 'POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) down -v' EXIT; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) up -d postgres redis localstack workspace-init api worker web; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) $(INTEGRATION_COMPOSE) exec -T web sh -lc "SELFHOST_SMOKE_API_BASE_URL=http://api:3000 SELFHOST_SMOKE_WEB_BASE_URL=http://127.0.0.1:$(INTEGRATION_WEB_PORT) node --import tsx /workspace/scripts/selfhost-smoke.ts"

.PHONY: api-check
api-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm api:check"

.PHONY: dev
dev: ensure-probe-trigger-secret install
	@set -e; \
	if $(DOCKER_COMPOSE) --profile dev up; then \
		exit 0; \
	fi; \
	if $(DOCKER_COMPOSE) logs db-bootstrap 2>/dev/null | grep -Eq "$(LEGACY_STORAGE_BOOTSTRAP_ERROR)|$(PARTIAL_STORAGE_BOOTSTRAP_ERROR)"; then \
		echo "Incompatible local database schema detected; resetting local dev state and retrying."; \
		$(DOCKER_COMPOSE) --profile dev down -v; \
		exec $(DOCKER_COMPOSE) --profile dev up; \
	fi; \
	exit 1

.PHONY: dev-public
dev-public:
	docker run --rm -it \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-p $(PUBLIC_SITE_PORT):$(PUBLIC_SITE_PORT) \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && cd site && corepack pnpm exec next dev --hostname 0.0.0.0 --port $(PUBLIC_SITE_PORT)"

.PHONY: backend-restart
backend-restart: ensure-probe-trigger-secret install
	$(DOCKER_COMPOSE) --profile dev up -d --force-recreate api worker

.PHONY: dev-down
dev-down:
	$(DOCKER_COMPOSE) --profile dev down

.PHONY: dev-reset
dev-reset:
	$(DOCKER_COMPOSE) --profile dev down -v
	$(MAKE) infra-bootstrap
	$(DOCKER_COMPOSE) --profile dev up -d

.PHONY: api-run
api-run: infra-bootstrap
	docker run --rm -it \
		--network "$(COMPOSE_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-p 3003:3000 \
		-e API_HOST=0.0.0.0 \
		-e API_PORT=3000 \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
		-e REDIS_URL=redis://redis:6379 \
		-e S3_ENDPOINT=http://localstack:4566 \
		-e S3_REGION=us-east-1 \
		-e S3_BUCKET=debugbundle-raw-events \
		-e AWS_ACCESS_KEY_ID=test \
		-e AWS_SECRET_ACCESS_KEY=test \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm api:start"

.PHONY: worker-check
worker-check:
	$(NODE_RUN) "corepack enable && corepack pnpm worker:check"

.PHONY: worker-run
worker-run: infra-bootstrap
	docker run --rm -it \
		--network "$(COMPOSE_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
		-e REDIS_URL=redis://redis:6379 \
		-e S3_ENDPOINT=http://localstack:4566 \
		-e S3_REGION=us-east-1 \
		-e S3_BUCKET=debugbundle-raw-events \
		-e AWS_ACCESS_KEY_ID=test \
		-e AWS_SECRET_ACCESS_KEY=test \
		-e WORKER_POLL_INTERVAL_MS=$(WORKER_POLL_INTERVAL_MS) \
		-e WORKER_RUN_ONCE=$(WORKER_RUN_ONCE) \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm worker:start"

.PHONY: shell
shell:
	docker run --rm -it -v "$(PWD):$(WORKDIR)" -w "$(WORKDIR)" $(NODE_IMAGE) sh
