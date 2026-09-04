SHELL := /bin/sh

DEBUGBUNDLE_PROBE_TRIGGER_SECRET ?= $(shell sed -n 's/^DEBUGBUNDLE_PROBE_TRIGGER_SECRET=\(.*\)$$/\1/p' .env 2>/dev/null | head -n 1)
ANALYTICS_HASH_SECRET ?= $(shell sed -n 's/^ANALYTICS_HASH_SECRET=\(.*\)$$/\1/p' .env 2>/dev/null | head -n 1)
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
INTEGRATION_ANALYTICS_HASH_SECRET ?= debugbundle-selfhost-analytics-secret
INTEGRATION_GITHUB_MOCK_TOKEN ?= debugbundle-dev-mock-code
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
	@echo "  make compose-check   Run local Docker Compose configuration checks"
	@echo "  make load-check      Run noisy-ingestion load checks via Docker"
	@echo "  make perf-check      Run performance benchmark checks via Docker"
	@echo "  make test-unit       Run unit tests with coverage gates via Docker"
	@echo "  make test            Alias of test-unit"
	@echo "  make test-all        Run unit+coverage and integration tests"
	@echo "  make test-all-quick  Run unit (no coverage) and integration tests"
	@echo "  make selfhost-smoke  Prove self-host auth, debug ingestion, browser analytics, rollups, and bundles"
	@echo "  make build           Run build via Docker"
	@echo "  make ci              Run lint + typecheck + test + build via Docker"
	@echo "  make release-mcp-ecosystem-plan VERSION=x.y.z"
	@echo "  make release-mcp-ecosystem-prepare VERSION=x.y.z"
	@echo "  make release-mcp-ecosystem-publish VERSION=x.y.z TARGETS=officialRegistry,smithery,clawhub"
	@echo "  make release-mcp-ecosystem-verify VERSION=x.y.z TARGETS=officialRegistry,smithery,clawhub,glama,lobehub"
	@echo "  make release-mcp-ecosystem VERSION=x.y.z"
	@echo "  make openai-plugin-validate  Validate the source-ready OpenAI plugin package"
	@echo "  make openai-plugin-check     Run package, skill, and release contract tests"
	@echo "  make openai-plugin-inspector-check Validate the exact data-free catalog with MCP Inspector"
	@echo "  make openai-plugin-plan      Print the non-mutating OpenAI release plan"
	@echo "  make openai-plugin-prepare   Build deterministic local candidate archives"
	@echo "  make openai-plugin-verify    Verify source manifest and candidate hashes"
	@echo "  make test-integration Run Compose-backed ingestion integration tests"
	@echo "  make api-check       Run API runtime bootstrap tests"
	@echo "  make backend-restart Recreate API + worker so they reload current env"
	@echo "  make dev             Start everything (infra + API + worker + web) and open http://localhost:5291"
	@echo "  make dev-openai-plugin-preview Start dev with the local synthetic OpenAI UI review route"
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
	@if [ -z "$(ANALYTICS_HASH_SECRET)" ]; then \
		echo "ANALYTICS_HASH_SECRET is required for API and worker startup."; \
		echo "Set it in .env before running this target. Example:"; \
		echo "  cp .env.example .env"; \
		echo "  printf '\nANALYTICS_HASH_SECRET=%s\n' \"$$(openssl rand -hex 32)\" >> .env"; \
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
	$(NODE_RUN) "corepack enable && NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm lint"

.PHONY: typecheck
typecheck:
	$(NODE_RUN) "corepack enable && corepack pnpm typecheck"

.PHONY: web-check
web-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm vitest run tests/apps/web/web-app-auth.test.tsx tests/apps/web/web-app-billing-refresh.test.tsx tests/apps/web/web-app-management.test.tsx tests/apps/web/web-app-incidents.test.tsx tests/apps/web/web-app-openai-oauth.test.tsx tests/apps/web/web-openai-plugin-preview.test.tsx tests/apps/web/web-dogfooding.test.ts && corepack pnpm typecheck"

.PHONY: compose-check
compose-check:
	$(NODE_RUN) "corepack enable && corepack pnpm vitest run tests/infrastructure/local-compose.test.ts"

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
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && corepack pnpm vitest run"
	$(MAKE) test-integration

.PHONY: build
build:
	$(NODE_RUN) "corepack enable && corepack pnpm build"

.PHONY: release-mcp-ecosystem-plan
release-mcp-ecosystem-plan:
	node scripts/release-mcp-ecosystem.mjs plan $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: release-mcp-ecosystem-prepare
release-mcp-ecosystem-prepare:
	node scripts/release-mcp-ecosystem.mjs prepare $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: release-mcp-ecosystem-publish
release-mcp-ecosystem-publish:
	node scripts/release-mcp-ecosystem.mjs publish $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: release-mcp-ecosystem-verify
release-mcp-ecosystem-verify:
	node scripts/release-mcp-ecosystem.mjs verify $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: release-mcp-ecosystem
release-mcp-ecosystem:
	node scripts/release-mcp-ecosystem.mjs run $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: openai-plugin-validate
openai-plugin-validate:
	$(NODE_RUN) "node scripts/validate-openai-plugin.mjs && node scripts/release-openai-plugin.mjs validate"

.PHONY: openai-plugin-check
openai-plugin-check:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm vitest run tests/apps/mcp/mcp-openai-plugin.test.ts tests/contracts/openai-plugin-skill-parity.test.ts tests/infrastructure/openai-plugin-release.test.ts"

.PHONY: openai-plugin-inspector-check
openai-plugin-inspector-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && npx --yes @modelcontextprotocol/inspector@2.5.0 --cli ./node_modules/.bin/tsx scripts/openai-plugin-inspector-harness.ts --method tools/list --strict --format json >/dev/null"

.PHONY: openai-plugin-plan
openai-plugin-plan:
	$(NODE_RUN) "node scripts/release-openai-plugin.mjs plan"

.PHONY: openai-plugin-prepare
openai-plugin-prepare:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node scripts/release-openai-plugin.mjs prepare $(if $(OPENAI_REQUIRE_CONNECTION),--require-connection,) $(if $(OPENAI_API_IMAGE_DIGEST),--api-image-digest $(OPENAI_API_IMAGE_DIGEST),)"

.PHONY: openai-plugin-verify
openai-plugin-verify:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node scripts/release-openai-plugin.mjs verify $(if $(OPENAI_REQUIRE_CONNECTION),--require-connection,) $(if $(OPENAI_API_IMAGE_DIGEST),--api-image-digest $(OPENAI_API_IMAGE_DIGEST),)"

.PHONY: ci
ci: lint typecheck test build

.PHONY: test-integration
test-integration:
	@set -e; \
	trap 'POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) down -v' EXIT; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) up -d --wait postgres redis localstack; \
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
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:bootstrap && corepack pnpm db:migrate && corepack pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/integration/alert-delivery-dedupe.integration.test.ts tests/integration/analytics-correlation.integration.test.ts tests/integration/analytics-incident-impact.integration.test.ts tests/integration/analytics-saved-funnels.integration.test.ts tests/integration/availability-checks.integration.test.ts tests/integration/ingestion-core.integration.test.ts tests/integration/ingestion-bundle-triggers.integration.test.ts tests/integration/ingestion-replay-idempotency.integration.test.ts tests/integration/ingestion-lifecycle-webhooks.integration.test.ts tests/integration/billing-sync.integration.test.ts tests/integration/openai-coordination.integration.test.ts tests/integration/openai-reviewer-fixtures.integration.test.ts tests/integration/project-deletion.integration.test.ts tests/integration/retention-cleanup.integration.test.ts tests/integration/retention-sampling.integration.test.ts tests/integration/storage-migrations.integration.test.ts"

.PHONY: test-integration-down
test-integration-down:
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) down -v

.PHONY: selfhost-smoke
selfhost-smoke:
	@set -e; \
	chmod +x deploy/selfhost/localstack-init/01-create-bucket.sh; \
	trap 'POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) down -v' EXIT; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) DEV_GITHUB_MOCK_LOGIN=true $(INTEGRATION_COMPOSE) up -d postgres redis localstack workspace-init api worker web; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) DEV_GITHUB_MOCK_LOGIN=true $(INTEGRATION_COMPOSE) exec -T web sh -lc "SELFHOST_SMOKE_API_BASE_URL=http://api:3000 SELFHOST_SMOKE_WEB_BASE_URL=http://127.0.0.1:$(INTEGRATION_WEB_PORT) SELFHOST_SMOKE_GITHUB_ACCESS_TOKEN=$(INTEGRATION_GITHUB_MOCK_TOKEN) node --import tsx /workspace/scripts/selfhost-smoke.ts"

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
	docker run --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-p $(PUBLIC_SITE_PORT):$(PUBLIC_SITE_PORT) \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm public-site:artifacts && corepack pnpm --dir ./site install --force --frozen-lockfile=false && corepack pnpm --dir ./site dev --hostname 0.0.0.0 --port $(PUBLIC_SITE_PORT)"

.PHONY: dev-openai-plugin-preview
dev-openai-plugin-preview:
	$(MAKE) VITE_OPENAI_PLUGIN_PREVIEW=true dev

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
api-run: ensure-probe-trigger-secret infra-bootstrap
	docker run --rm -it \
		--network "$(COMPOSE_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-p 3003:3000 \
		-e API_HOST=0.0.0.0 \
		-e API_PORT=3000 \
		-e DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(DEBUGBUNDLE_PROBE_TRIGGER_SECRET) \
		-e ANALYTICS_HASH_SECRET=$(ANALYTICS_HASH_SECRET) \
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
worker-run: ensure-probe-trigger-secret infra-bootstrap
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
		-e ANALYTICS_HASH_SECRET=$(ANALYTICS_HASH_SECRET) \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm worker:start"

.PHONY: shell
shell:
	docker run --rm -it -v "$(PWD):$(WORKDIR)" -w "$(WORKDIR)" $(NODE_IMAGE) sh
