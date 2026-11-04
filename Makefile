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
	@echo "  make audit           Check dependency advisories at high severity via Docker"
	@echo "  make typecheck       Run TypeScript checks via Docker"
	@echo "  make web-check       Run web app routing and management tests via Docker"
	@echo "  make compose-check   Run local Docker Compose configuration checks"
	@echo "  make load-check      Run noisy-ingestion load checks via Docker"
	@echo "  make incident-recovery-check  Exercise real HTTP/storage bursts and crashes in isolated Docker"
	@echo "  make perf-check      Run performance benchmark checks via Docker"
	@echo "  make test-unit       Run unit tests with coverage gates via Docker"
	@echo "  make test            Alias of test-unit"
	@echo "  make test-all        Run unit+coverage and integration tests"
	@echo "  make test-all-quick  Run unit (no coverage) and integration tests"
	@echo "  make selfhost-smoke  Prove self-host auth, debug ingestion, browser analytics, rollups, and bundles"
	@echo "  make cli-runtime-check  Verify clean installed CLI packages across Node 22/24/26, including 26.0.0"
	@echo "  make build           Run build via Docker"
	@echo "  make candidate-build Build shared schemas, CLI, MCP and web artifacts without publishing"
	@echo "  make ci              Run lint + typecheck + test + build via Docker"
	@echo "  make release-mcp-ecosystem-plan VERSION=x.y.z"
	@echo "  make release-mcp-ecosystem-prepare VERSION=x.y.z"
	@echo "  make release-mcp-ecosystem-publish VERSION=x.y.z TARGETS=officialRegistry,smithery,clawhub"
	@echo "  make release-mcp-ecosystem-verify VERSION=x.y.z TARGETS=officialRegistry,smithery,clawhub,glama,lobehub"
	@echo "  make release-mcp-ecosystem VERSION=x.y.z"
	@echo "  make codex-plugin-check     Check Codex packaging and existing MCP compatibility"
	@echo "  make gemini-extension-check Check Gemini extension contracts and guidance"
	@echo "  make gemini-extension-package Build the standalone Gemini extension archive"
	@echo "  make gemini-extension-smoke Verify a fresh Gemini CLI without customer access"
	@echo "  make gemini-extension-verify-public Check public Gemini files and version tag against core"
	@echo "  make codex-plugin-smoke     Verify a fresh Codex client against synthetic data"
	@echo "  make openclaw-plugin-check  Build and validate the OpenClaw companion package"
	@echo "  make openclaw-runtime-check Verify the emitted plugin on native Node 22/24/26"
	@echo "  make openclaw-installed-check Verify the packed plugin in a clean OpenClaw host"
	@echo "  make openclaw-release-check  Validate both OpenClaw distributions before publication"
	@echo "  make openai-plugin-validate  Validate the source-ready OpenAI plugin package"
	@echo "  make openai-plugin-check     Run package, skill, and release contract tests"
	@echo "  make openai-plugin-inspector-check Validate the exact data-free catalog with MCP Inspector"
	@echo "  make openai-plugin-plan      Print the non-mutating OpenAI release plan"
	@echo "  make openai-plugin-prepare   Build deterministic local candidate archives"
	@echo "  make openai-plugin-verify    Verify source manifest and candidate hashes"
	@echo "  make test-integration Run Compose-backed ingestion integration tests"
	@echo "  make test-mixed-version-api PREVIOUS_API_REVISION=<deployed core SHA>  Verify old/new API on an isolated forward-migrated DB"
	@echo "  make worker-jobs     Inspect scoped durable worker job metadata (read-only by default)"
	@echo "  make api-check       Run API runtime bootstrap tests"
	@echo "  make backend-restart Recreate API + worker so they reload current env"
	@echo "  make dev             Start everything (infra + API + worker + web) and open http://localhost:5291"
	@echo "  make dev-mock        Show synthetic UI data at http://localhost:5291/dashboard"
	@echo "  make dev-mock-off    Restore the web frontend to the real local API"
	@echo "  make dev-openai-plugin-preview Start dev with the local synthetic OpenAI UI review route"
	@echo "  make dev-public      Start the public-site dev server at http://localhost:5292"
	@echo "  make public-site-artifacts Refresh generated public API/reference artifacts"
	@echo "  make dev-down        Stop the full local dev stack"
	@echo "  make dev-reset       Drop local DB/cache/object-store state and rebuild from scratch"
	@echo "  make api-run         Start API with env-driven dependencies on compose network"
	@echo "  make worker-check    Run worker bootstrap/processor tests"
	@echo "  make worker-memory-check Check bounded idle-poll memory in isolation"
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
			$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:bootstrap $(STORAGE_BOOTSTRAP_FLAGS)"

.PHONY: db-migrate
db-migrate: STORAGE_BOOTSTRAP_FLAGS := --if-empty
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

.PHONY: audit
audit:
	$(NODE_RUN) "corepack enable && node scripts/dependency-audit.mjs --audit-level=high"

.PHONY: typecheck
typecheck:
	$(NODE_RUN) "corepack enable && corepack pnpm typecheck"

.PHONY: web-check
web-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm vitest run tests/apps/web/web-app-*.test.tsx tests/apps/web/web-openai-plugin-preview.test.tsx tests/apps/web/web-dogfooding.test.ts && corepack pnpm typecheck"

.PHONY: compose-check
compose-check:
	$(NODE_RUN) "corepack enable && corepack pnpm vitest run tests/infrastructure/local-compose.test.ts"

.PHONY: perf-check
perf-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && node --import tsx scripts/perf-check.ts"

.PHONY: load-check
load-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && node --import tsx scripts/ingestion-load-check.ts"

# Internal, metadata-only inspection by default. Retry requires an exact project and job.
.PHONY: worker-jobs
worker-jobs:
	$(DOCKER_COMPOSE) exec -T -e WORKER_JOB_PROJECT_ID -e WORKER_JOB_ID -e WORKER_JOB_RETRY worker sh -lc "node --import tsx scripts/worker-jobs.ts"

.PHONY: codex-plugin-check
.PHONY: agent-guidance-sync agent-guidance-check
agent-guidance-sync:
	$(NODE_RUN) "node --import tsx scripts/sync-agent-interface-guidance.ts --write"

agent-guidance-check:
	$(NODE_RUN) "node --import tsx scripts/sync-agent-interface-guidance.ts && corepack enable && corepack pnpm vitest run tests/contracts/agent-interface-routing.test.ts"

codex-plugin-check:
	$(NODE_RUN) "corepack enable && corepack pnpm vitest run tests/contracts/codex-developer-plugin.test.ts tests/apps/mcp tests/contracts/openai-plugin-skill-parity.test.ts tests/contracts/openai-plugin-cli-handoff.test.ts tests/contracts/agent-interface-routing.test.ts tests/apps/openclaw-plugin"

.PHONY: gemini-extension-check gemini-extension-package gemini-extension-smoke gemini-extension-verify-public
gemini-extension-check:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && corepack pnpm vitest run tests/contracts/gemini-developer-extension.test.ts tests/infrastructure/gemini-extension-package.test.ts tests/infrastructure/gemini-extension-publication.test.ts tests/contracts/agent-interface-routing.test.ts tests/packages/agent-setup tests/apps/cli/cli-agent-setup.test.ts"

gemini-extension-package:
	$(NODE_RUN) "node scripts/package-gemini-extension.mjs"

gemini-extension-verify-public:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node scripts/verify-gemini-publication.mjs"

GEMINI_SMOKE_VERSION ?= 0.61.0
GEMINI_SMOKE_NODE_IMAGE ?= node:24-bookworm
gemini-extension-smoke:
	docker run --rm -v "$(PWD):/source:ro" -e GEMINI_SMOKE_VERSION="$(GEMINI_SMOKE_VERSION)" $(GEMINI_SMOKE_NODE_IMAGE) node /source/scripts/smoke-gemini-extension.mjs

.PHONY: openclaw-plugin-check
openclaw-plugin-check:
	$(NODE_RUN) "corepack enable && corepack pnpm --dir apps/openclaw-plugin plugin:check"

.PHONY: openclaw-runtime-check
openclaw-runtime-check: openclaw-plugin-check
	@for runtime_image in node:22-alpine node:24-alpine node:26-alpine; do \
	  docker run --rm --network none -v "$(PWD):/workspace:ro" -w /workspace "$$runtime_image" node apps/openclaw-plugin/scripts/check-runtime.mjs || exit $$?; \
	done

.PHONY: openclaw-installed-check
openclaw-installed-check: openclaw-plugin-check
	$(NODE_RUN) 'mkdir -p .tmp/openclaw-installed-package && npm pack ./apps/openclaw-plugin --ignore-scripts --pack-destination .tmp/openclaw-installed-package >/dev/null'
	docker run --rm -v "$(PWD):/source:ro" -v "$(PWD)/.tmp/openclaw-installed-proof:/proof" -e OPENCLAW_CHECK_OUTPUT=/proof $(if $(OPENCLAW_CHECK_ACCEPT_CAPABILITIES),-e OPENCLAW_CHECK_ACCEPT_CAPABILITIES="$(OPENCLAW_CHECK_ACCEPT_CAPABILITIES)",) $(if $(OPENCLAW_CHECK_TRUST_LOCAL),-e OPENCLAW_CHECK_TRUST_LOCAL="$(OPENCLAW_CHECK_TRUST_LOCAL)",) $(if $(OPENCLAW_CHECK_HOST_VERSION),-e OPENCLAW_CHECK_HOST_VERSION="$(OPENCLAW_CHECK_HOST_VERSION)",) $(if $(OPENCLAW_CHECK_SPEC),-e OPENCLAW_CHECK_SPEC="$(OPENCLAW_CHECK_SPEC)",) node:24-bookworm node /source/scripts/check-openclaw-installed.mjs

.PHONY: openclaw-release-check
openclaw-release-check: openclaw-plugin-check openclaw-runtime-check openclaw-installed-check
	$(MAKE) test-focused TEST_FILES='tests/apps/openclaw-plugin tests/contracts/openclaw-plugin-parity.test.ts tests/apps/mcp/mcp-clawhub-skill.test.ts tests/apps/mcp/mcp-legacy-contract.test.ts tests/apps/mcp/mcp-ecosystem-release.test.ts tests/apps/mcp/mcp-ecosystem-security.test.ts tests/apps/mcp/mcp-ecosystem-publication.test.ts tests/contracts/codex-developer-plugin.test.ts --maxWorkers=2'

.PHONY: openclaw-plugin-build
openclaw-plugin-build:
	$(NODE_RUN) "corepack enable && corepack pnpm --dir apps/openclaw-plugin build && corepack pnpm --dir apps/openclaw-plugin plugin:build"

# A disposable home keeps native Claude verification separate from personal auth.
CLAUDE_SMOKE_VERSION ?= 2.1.277
.PHONY: claude-plugin-smoke
claude-plugin-smoke:
	docker run --rm -v "$(PWD):/source:ro" -e CLAUDE_SMOKE_VERSION="$(CLAUDE_SMOKE_VERSION)" node:24-bookworm node /source/scripts/smoke-claude-plugin.mjs

.PHONY: claude-plugin-smoke-github
claude-plugin-smoke-github:
	docker run --rm -v "$(PWD):/source:ro" -e CLAUDE_SMOKE_VERSION="$(CLAUDE_SMOKE_VERSION)" -e CLAUDE_SMOKE_GITHUB=1 node:24-bookworm node /source/scripts/smoke-claude-plugin.mjs

# A fresh container home prevents access to personal Codex or DebugBundle auth.
CODEX_SMOKE_VERSION ?= 0.153.1
CODEX_SMOKE_NODE_IMAGE ?= node:24-bookworm
.PHONY: codex-plugin-pack
codex-plugin-pack:
	$(NODE_RUN) "corepack enable && corepack pnpm --dir apps/mcp build && mkdir -p .tmp/codex-plugin && npm pack ./apps/mcp --ignore-scripts --pack-destination .tmp/codex-plugin"

.PHONY: codex-plugin-smoke
codex-plugin-smoke: codex-plugin-pack
	docker run --rm -v "$(PWD):/source:ro" -e CODEX_SMOKE_VERSION="$(CODEX_SMOKE_VERSION)" -e MCP_SMOKE_CANDIDATE=1 $(CODEX_SMOKE_NODE_IMAGE) node /source/scripts/smoke-codex-plugin.mjs

.PHONY: codex-plugin-runtime-check
codex-plugin-runtime-check: codex-plugin-pack
	@set -eu; for runtime_image in node:22-bookworm node:24-bookworm node:26-bookworm; do \
	  docker run --rm -v "$(PWD):/source:ro" -e CODEX_SMOKE_VERSION="$(CODEX_SMOKE_VERSION)" -e MCP_SMOKE_CANDIDATE=1 $$runtime_image node /source/scripts/smoke-codex-plugin.mjs; \
	done

.PHONY: codex-plugin-smoke-published
codex-plugin-smoke-published:
	docker run --rm -v "$(PWD):/source:ro" -e CODEX_SMOKE_VERSION="$(CODEX_SMOKE_VERSION)" -e MCP_SMOKE_PUBLISHED=1 $(CODEX_SMOKE_NODE_IMAGE) node /source/scripts/smoke-codex-plugin.mjs

.PHONY: codex-plugin-smoke-github
codex-plugin-smoke-github:
	docker run --rm -v "$(PWD):/source:ro" -e CODEX_SMOKE_VERSION="$(CODEX_SMOKE_VERSION)" -e MCP_SMOKE_GITHUB=1 $(CODEX_SMOKE_NODE_IMAGE) node /source/scripts/smoke-codex-plugin.mjs

.PHONY: test-focused
.PHONY: privacy-fixtures-sync privacy-fixtures-check
privacy-fixtures-sync:
	$(NODE_RUN) "node scripts/sync-privacy-fixtures.mjs --write"

privacy-fixtures-check:
	$(NODE_RUN) "node scripts/sync-privacy-fixtures.mjs --check"

.PHONY: privacy-js-local-test privacy-js-verify
privacy-js-local-test: license-prepare-shared privacy-js-verify
privacy-js-verify:
	$(NODE_RUN) "corepack enable && node scripts/test-js-sdk-with-local-redaction.mjs $(TEST_FILES)"

.PHONY: privacy-js-candidate-check
JS_CANDIDATE_NODE_IMAGE ?= $(NODE_IMAGE)
privacy-js-candidate-check: license-prepare-shared
	$(NODE_RUN) 'node scripts/prepare-js-sdk-candidate-lock.mjs --check'
	docker run --rm -v "$(PWD):$(WORKDIR)" --tmpfs "$(WORKDIR)/sdks/debugbundle-js/.tmp" -w "$(WORKDIR)" $(JS_CANDIDATE_NODE_IMAGE) sh -lc 'if ! command -v corepack >/dev/null 2>&1; then npm install --global corepack@0.34.1 >/dev/null; fi && corepack enable && node scripts/test-js-sdk-with-local-redaction.mjs --candidate && mkdir -p .tmp/sdk-js-candidate && cp sdks/debugbundle-js/.tmp/npm-packages/*.tgz .tmp/sdk-js-candidate/'

.PHONY: js-candidate-lock
js-candidate-lock: license-prepare-shared
	$(NODE_RUN) 'node scripts/prepare-js-sdk-candidate-lock.mjs $(LOCK_ARGS)'

.PHONY: js-candidate-audit
js-candidate-audit:
	$(NODE_RUN) 'node scripts/audit-js-sdk-candidate.mjs'

.PHONY: privacy-js-local-smoke
JS_SMOKE_NODE_IMAGE ?= node:26-alpine
privacy-js-local-smoke: license-prepare-shared
	docker run --rm -t -v "$(PWD):$(WORKDIR)" --tmpfs "$(WORKDIR)/sdks/debugbundle-js/.tmp" -w "$(WORKDIR)" $(JS_SMOKE_NODE_IMAGE) sh -lc 'npm install --global corepack@0.34.1 >/dev/null && corepack enable && node scripts/test-js-sdk-with-local-redaction.mjs --consumer && mkdir -p .tmp/sdk-js-installed && cp sdks/debugbundle-js/.tmp/npm-packages/*.tgz .tmp/sdk-js-installed/'

.PHONY: incident-recovery-check
incident-recovery-check:
	python3 scripts/incident-recovery-check.py

.PHONY: browser-evidence-check
browser-evidence-check: license-prepare-shared
	docker run --rm --network none -v "$(CURDIR):/workspace" -w /workspace mcr.microsoft.com/playwright:v1.63.0-noble sh -lc 'set -- /ms-playwright/chromium-*/chrome-linux*/chrome; test "$$#" -eq 1 && CHROMIUM_PATH="$$1" node scripts/test-js-sdk-with-local-redaction.mjs --browser-evidence'

test-focused:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && corepack pnpm vitest run $(TEST_FILES)"

.PHONY: project-service-test project-service-format project-service-check project-service-integration
project-service-test:
	$(NODE_RUN) "node_modules/.bin/vitest run --reporter=dot $(if $(TEST_FILES),$(TEST_FILES),tests/packages/storage/project-merge-plan.test.ts)"

project-service-format:
	test -n "$(FORMAT_FILES)"
	$(NODE_RUN) "node_modules/.bin/prettier --write $(FORMAT_FILES)"

project-service-check:
	test -n "$(LINT_FILES)"
	$(NODE_RUN) "node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/eslint $(LINT_FILES) && node_modules/.bin/prettier --check $(LINT_FILES)"

project-service-integration:
	sh scripts/test-project-services-integration.sh

.PHONY: project-service-runtime
project-service-runtime: candidate-build
	sh scripts/test-project-service-runtime.sh

.PHONY: project-service-predecessor-fixture
project-service-predecessor-fixture:
	sh scripts/capture-project-service-predecessor.sh

.PHONY: test-billing-checkout-integration
test-billing-checkout-integration:
	sh scripts/test-billing-checkout-integration.sh

# Use the already installed, lockfile-pinned tools without fetching Corepack.
.PHONY: billing-safety-check billing-safety-format billing-safety-test
billing-safety-test:
	test -n "$(TEST_FILES)"
	$(NODE_RUN) "node_modules/.bin/vitest run $(TEST_FILES)"

# Full-suite infrastructure fixtures create disposable Git repositories. Keep
# that tool inside this temporary container and reuse the installed JS packages.
.PHONY: billing-safety-unit-test
billing-safety-unit-test:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node_modules/.bin/vitest run --maxWorkers=4 --reporter=dot"

billing-safety-check:
	test -n "$(LINT_FILES)" && test -n "$(TEST_FILES)"
	$(NODE_RUN) "node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/eslint $(LINT_FILES) && node_modules/.bin/prettier --check $(LINT_FILES) && node_modules/.bin/vitest run $(TEST_FILES)"

billing-safety-format:
	test -n "$(FORMAT_FILES)"
	$(NODE_RUN) "node_modules/.bin/prettier --write $(FORMAT_FILES)"

.PHONY: coverage-focused
coverage-focused:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && VITEST_COVERAGE_SHARD=1 corepack pnpm vitest run --coverage $(TEST_FILES) && node scripts/check-changed-file-coverage.mjs"

# Recheck an existing merged report against the whole reviewed commit range.
.PHONY: coverage-changed-check
coverage-changed-check:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && BASE_SHA=$(BASE_SHA) HEAD_SHA=$(HEAD_SHA) node scripts/check-changed-file-coverage.mjs"

.PHONY: format-focused
format-focused:
	$(NODE_RUN) "corepack enable && corepack pnpm exec prettier --write $(FORMAT_FILES)"

# Inspect official component documentation without changing app dependencies or files.
.PHONY: ui-component-docs
ui-component-docs:
	docker run --rm -v "$(PWD)/apps/web:$(WORKDIR):ro" -w "$(WORKDIR)" $(NODE_IMAGE) sh -lc "corepack enable && corepack pnpm dlx shadcn@latest docs $(UI_COMPONENTS)"

# Add shared shadcn primitives through the app's registry/config inside Docker.
.PHONY: ui-component-add
ui-component-add:
	docker run --rm -e CI=1 -v "$(PWD):$(WORKDIR)" -w "$(WORKDIR)/apps/web" $(NODE_IMAGE) sh -lc "corepack enable && corepack pnpm dlx shadcn@latest add $(UI_COMPONENTS) $(UI_COMPONENT_FLAGS)"

.PHONY: lint-focused
lint-focused:
	$(NODE_RUN) "corepack enable && corepack pnpm exec eslint $(LINT_FILES)"

CLI_RUNTIME_IMAGES ?= node:22-alpine node:24-alpine node:26.0.0-alpine node:26.2.0-alpine node:26-alpine
.PHONY: muse-setup-check
muse-setup-check: cli-runtime-pack
	docker run --rm -v "$(PWD)/scripts:/scripts:ro" -v "$(PWD)/.tmp/muse-runtime:/artifacts" node:24-bookworm node /scripts/check-muse-setup.mjs --download /artifacts/muse
	docker run --rm -v "$(PWD):/source:ro" -v "$(PWD)/.tmp/muse-consumer:/consumer" -w /tmp node:24-bookworm sh -lc 'cli_version=$$(node -p "require(\"/source/apps/cli/package.json\").version") && npm install --prefix /consumer --no-audit --no-fund --ignore-scripts "/source/.tmp/cli-runtime-package/debugbundle-cli-$$cli_version.tgz" >/dev/null'
	docker run --rm --network none -v "$(PWD):/source:ro" -w /tmp node:24-bookworm node /source/scripts/check-muse-setup.mjs /source/.tmp/muse-consumer/node_modules/@debugbundle/cli/bin/debugbundle.js /source/.tmp/muse-runtime/muse

.PHONY: cli-runtime-pack cli-runtime-check
cli-runtime-pack:
	$(NODE_RUN) 'corepack enable && mkdir -p .tmp/cli-runtime-package && npm pack ./apps/cli --pack-destination .tmp/cli-runtime-package'

cli-runtime-check: cli-runtime-pack cli-setup-upgrade-check
	@set -e; for runtime_image in $(CLI_RUNTIME_IMAGES); do \
		docker run --rm -v "$(PWD):/source:ro" -w /tmp "$$runtime_image" sh -lc 'apk add --no-cache openssl >/dev/null && cli_version=$$(node -p "require(\"/source/apps/cli/package.json\").version") && npm install --prefix /tmp/cli-consumer --no-audit --no-fund --ignore-scripts "/source/.tmp/cli-runtime-package/debugbundle-cli-$$cli_version.tgz" >/dev/null && node /source/scripts/check-cli-runtime.mjs /tmp/cli-consumer/node_modules/@debugbundle/cli/bin/debugbundle.js'; \
	done

# Compare against the actual published predecessor, not regenerated test fixtures.
.PHONY: cli-setup-upgrade-check
cli-setup-upgrade-check: cli-runtime-pack
	docker run --rm -v "$(PWD):/source:ro" -w /tmp node:24-alpine sh -lc 'cli_version=$$(node -p "require(\"/source/apps/cli/package.json\").version") && npm install --prefix /tmp/cli-previous --no-audit --no-fund --ignore-scripts @debugbundle/cli@1.10.0 >/dev/null && npm install --prefix /tmp/cli-candidate --no-audit --no-fund --ignore-scripts "/source/.tmp/cli-runtime-package/debugbundle-cli-$$cli_version.tgz" >/dev/null && node /source/scripts/check-cli-setup-upgrade.mjs /tmp/cli-previous/node_modules/@debugbundle/cli/bin/debugbundle.js /tmp/cli-candidate/node_modules/@debugbundle/cli/bin/debugbundle.js'

.PHONY: test-unit
test-unit:
	PROJECT_SERVICE_UNIT=1 NODE_IMAGE="$(NODE_IMAGE)" BASE_SHA="$(BASE_SHA)" HEAD_SHA="$(HEAD_SHA)" sh scripts/test-project-services-integration.sh

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

.PHONY: candidate-build
candidate-build:
	$(NODE_RUN) "corepack enable && corepack pnpm --dir packages/shared-types build && corepack pnpm --dir apps/cli build && corepack pnpm --dir apps/mcp build && corepack pnpm --dir apps/web build"

.PHONY: evidence-artifact-manifests
evidence-artifact-manifests:
	python3 scripts/record-sdk-evidence-artifacts.py js python php ruby java dotnet react-native

.PHONY: evidence-release-manifest
evidence-release-manifest:
	EVIDENCE_RUNTIME_DIR="$(EVIDENCE_RUNTIME_DIR)" python3 scripts/record-evidence-release.py

EVIDENCE_RUNTIME_DIR ?= $(PWD)/.tmp/evidence-release/runtime-reviewed
.PHONY: evidence-runtime-prepare evidence-runtime-build evidence-runtime-check
evidence-runtime-prepare:
	python3 scripts/rehearse-evidence-runtime.py prepare --directory "$(EVIDENCE_RUNTIME_DIR)"
evidence-runtime-build:
	python3 scripts/rehearse-evidence-runtime.py build --directory "$(EVIDENCE_RUNTIME_DIR)"
evidence-runtime-check:
	python3 scripts/rehearse-evidence-runtime.py check --directory "$(EVIDENCE_RUNTIME_DIR)"

# Inspect official macOS/arm64 emulator packages without changing installed SDKs.
.PHONY: evidence-android-emulator-catalog
evidence-android-emulator-catalog:
	docker run --rm --platform linux/arm64 -v "$(PWD):/workspace" -w /workspace \
	  -e REPO_OS_OVERRIDE=macosx -e ANDROID_USER_HOME=/workspace/.tmp/android-emulator-home \
	  gradle:9.4.1-jdk21 sh -c 'sdks/debugbundle-android/.android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/workspace/.tmp/android-macos --list --channel=0'

.PHONY: evidence-android-emulator-prepare
ANDROID_EVIDENCE_API ?= 37
evidence-android-emulator-prepare:
	sh scripts/prepare-evidence-android-emulator.sh $(ANDROID_EVIDENCE_API)

.PHONY: evidence-android-device
evidence-android-device:
	python3 scripts/run-evidence-android-device.py --api $(ANDROID_EVIDENCE_API)

.PHONY: evidence-react-native-android-device
evidence-react-native-android-device:
	python3 scripts/run-evidence-android-device.py --api 37 --react-native

.PHONY: evidence-android-device-performance
evidence-android-device-performance:
	python3 scripts/run-evidence-android-device.py --api $(ANDROID_EVIDENCE_API) --performance

.PHONY: evidence-swift-floor-prepare
evidence-swift-floor-prepare:
	sh scripts/prepare-evidence-swift-floor.sh

.PHONY: evidence-swift-floor
evidence-swift-floor:
	sh scripts/run-evidence-swift-floor.sh

.PHONY: evidence-swift-floor-consumer
evidence-swift-floor-consumer:
	sh scripts/run-evidence-swift-floor.sh consumer

.PHONY: evidence-core-pack
evidence-core-pack:
	$(NODE_RUN) 'mkdir -p .tmp/evidence-release/npm && npm pack ./apps/cli --ignore-scripts --pack-destination .tmp/evidence-release/npm && npm pack ./apps/mcp --ignore-scripts --pack-destination .tmp/evidence-release/npm && npm pack ./apps/openclaw-plugin --ignore-scripts --pack-destination .tmp/evidence-release/npm'

.PHONY: build
build:
	$(NODE_RUN) "corepack enable && corepack pnpm build"

.PHONY: license-check license-prepare-shared npm-publishing-check
npm-publishing-check:
	$(NODE_RUN) 'corepack pnpm vitest run tests/infrastructure/js-sdk-release-workflow.test.ts'

.PHONY: format-lockfile
format-lockfile:
	$(NODE_RUN) 'corepack pnpm exec prettier --write pnpm-lock.yaml'

.PHONY: shared-js-publication-check
shared-js-publication-check: license-prepare-shared
	$(NODE_RUN) 'corepack pnpm vitest run tests/infrastructure/shared-js-release-publication.test.ts tests/infrastructure/js-sdk-release-workflow.test.ts && node scripts/check-shared-js-publication.mjs .tmp/apache-packages'

license-prepare-shared:
	$(NODE_RUN) 'CI=1 corepack pnpm --dir packages/shared-types exec tsc -p tsconfig.build.json && corepack pnpm --dir packages/redaction exec tsc -p tsconfig.build.json && node scripts/prepare-shared-js-release.mjs /tmp/apache-shared-js-publish && mkdir -p .tmp/apache-packages && npm pack /tmp/apache-shared-js-publish/shared-types --pack-destination .tmp/apache-packages && npm pack /tmp/apache-shared-js-publish/redaction --pack-destination .tmp/apache-packages'

license-check:
	$(NODE_RUN) 'corepack pnpm vitest run tests/infrastructure/release-governance.test.ts tests/infrastructure/public-core-repo.test.ts tests/apps/cli/cli-workspace-package.test.ts tests/apps/mcp/mcp-workspace-package.test.ts tests/apps/mcp/mcp-claude-code-plugin.test.ts tests/apps/mcp/mcp-clawhub-skill.test.ts tests/apps/mcp/mcp-ecosystem-release.test.ts tests/apps/mcp/mcp-legacy-contract.test.ts tests/apps/mcp/mcp-openai-plugin.test.ts tests/apps/openclaw-plugin/openclaw-plugin-package.test.ts'

.PHONY: release-mcp-ecosystem-plan
release-mcp-ecosystem-plan:
	node scripts/release-mcp-ecosystem.mjs plan $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),) $(if $(CLAWHUB_VERSION),--clawhub-version $(CLAWHUB_VERSION),)

.PHONY: release-mcp-ecosystem-prepare
release-mcp-ecosystem-prepare:
	node scripts/release-mcp-ecosystem.mjs prepare $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: release-mcp-ecosystem-publish
release-mcp-ecosystem-publish:
	node scripts/release-mcp-ecosystem.mjs publish $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),) $(if $(CLAWHUB_VERSION),--clawhub-version $(CLAWHUB_VERSION),)

.PHONY: release-mcp-ecosystem-verify
release-mcp-ecosystem-verify:
	node scripts/release-mcp-ecosystem.mjs verify $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),) $(if $(CLAWHUB_VERSION),--clawhub-version $(CLAWHUB_VERSION),)

.PHONY: release-mcp-ecosystem
release-mcp-ecosystem:
	node scripts/release-mcp-ecosystem.mjs run $(if $(VERSION),--version $(VERSION),) $(if $(TARGETS),--targets $(TARGETS),)

.PHONY: openai-plugin-validate
openai-plugin-validate:
	$(NODE_RUN) "node scripts/validate-openai-plugin.mjs && node scripts/release-openai-plugin.mjs validate"

.PHONY: openai-plugin-check
openai-plugin-check:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm vitest run tests/apps/mcp/mcp-openai-plugin.test.ts tests/contracts/openai-plugin-skill-parity.test.ts tests/contracts/openai-plugin-cli-handoff.test.ts tests/contracts/agent-interface-routing.test.ts tests/infrastructure/openai-plugin-release.test.ts tests/infrastructure/openai-plugin-diagnostics.test.ts"

.PHONY: openai-plugin-inspector-check
openai-plugin-inspector-check:
	$(NODE_RUN) "corepack enable && $(PNPM_INSTALL_RELAXED) && npx --yes @modelcontextprotocol/inspector@2.5.0 --cli ./node_modules/.bin/tsx scripts/openai-plugin-inspector-harness.ts --method tools/list --strict --format json >/dev/null"

.PHONY: openai-plugin-diagnostics
openai-plugin-diagnostics:
	$(NODE_RUN) "node scripts/openai-plugin-diagnostics.mjs"

.PHONY: openai-plugin-plan
openai-plugin-plan:
	$(NODE_RUN) "node scripts/release-openai-plugin.mjs plan"

.PHONY: openai-plugin-prepare
openai-plugin-prepare:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node scripts/release-openai-plugin.mjs prepare $(if $(OPENAI_REQUIRE_CONNECTION),--require-connection,) $(if $(OPENAI_API_IMAGE_DIGEST),--api-image-digest $(OPENAI_API_IMAGE_DIGEST),) $(if $(OPENAI_PLUGIN_OUTPUT),--output $(OPENAI_PLUGIN_OUTPUT),)"

.PHONY: openai-plugin-verify
openai-plugin-verify:
	$(NODE_RUN) "apk add --no-cache git >/dev/null && node scripts/release-openai-plugin.mjs verify $(if $(OPENAI_REQUIRE_CONNECTION),--require-connection,) $(if $(OPENAI_API_IMAGE_DIGEST),--api-image-digest $(OPENAI_API_IMAGE_DIGEST),) $(if $(OPENAI_PLUGIN_OUTPUT),--output $(OPENAI_PLUGIN_OUTPUT),)"

.PHONY: ci
ci: lint typecheck test build

INTEGRATION_TEST_FILES ?= tests/integration/analytics-public-flows.integration.test.ts tests/integration/browser-resource-retention.integration.test.ts tests/integration/worker-analytics-bundle.integration.test.ts tests/integration/deployment-attribution.integration.test.ts tests/integration/improvement-occurrence-order.integration.test.ts tests/integration/alert-delivery-dedupe.integration.test.ts tests/integration/analytics-correlation.integration.test.ts tests/integration/analytics-incident-impact.integration.test.ts tests/integration/analytics-saved-funnels.integration.test.ts tests/integration/availability-checks.integration.test.ts tests/integration/ingestion-core.integration.test.ts tests/integration/incident-reliability.integration.test.ts tests/integration/worker-durability.integration.test.ts tests/integration/worker-job-migration.integration.test.ts tests/integration/worker-pipeline-recovery.integration.test.ts tests/integration/ingestion-bundle-triggers.integration.test.ts tests/integration/ingestion-replay-idempotency.integration.test.ts tests/integration/ingestion-lifecycle-webhooks.integration.test.ts tests/integration/billing-sync.integration.test.ts tests/integration/openai-coordination.integration.test.ts tests/integration/openai-oauth-grant-revocation.integration.test.ts tests/integration/openai-reviewer-fixtures.integration.test.ts tests/integration/project-deletion.integration.test.ts tests/integration/retention-cleanup.integration.test.ts tests/integration/retention-sampling.integration.test.ts tests/integration/storage-migrations.integration.test.ts

.PHONY: test-integration
INTEGRATION_TEST_FILES += tests/integration/agent-token.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/browser-resource-recovery.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/typed-evidence-context.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/ingestion-bundle-context-triggers.integration.test.ts tests/integration/ingestion-bundle-occurrence-context.integration.test.ts tests/integration/ingestion-bundle-probe-context.integration.test.ts tests/integration/ingestion-bundle-trigger-precedence.integration.test.ts tests/integration/ingestion-bundle-reproduction.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/alert-retry-ownership.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/analytics-flow-runtime.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/list-pagination-counts.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/public-status-pages.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/browser-resource-capture.integration.test.ts
INTEGRATION_TEST_FILES += tests/integration/notification-preferences.integration.test.ts
# Optional absolute module path inside /workspace for a separately built Browser SDK candidate.
INTEGRATION_FLOW_SDK_MODULE ?=
# Real-storage fixtures include 1,001 sequential delivery transitions and cold
# artifact generation. Keep their test budget separate from unit-test defaults;
# transport and deadline assertions retain their own explicit bounds.
INTEGRATION_TEST_TIMEOUT ?= 15000
test-integration:
	@set -e; \
	trap 'POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) down -v' EXIT; \
	POSTGRES_PORT=$(INTEGRATION_POSTGRES_PORT) REDIS_PORT=$(INTEGRATION_REDIS_PORT) LOCALSTACK_PORT=$(INTEGRATION_LOCALSTACK_PORT) API_PORT=$(INTEGRATION_API_PORT) WEB_PORT=$(INTEGRATION_WEB_PORT) APP_BASE_URL=$(INTEGRATION_APP_BASE_URL) VITE_API_URL=$(INTEGRATION_WEB_API_URL) CONTAINER_PREFIX=$(INTEGRATION_CONTAINER_PREFIX) DEBUGBUNDLE_PROBE_TRIGGER_SECRET=$(INTEGRATION_PROBE_TRIGGER_SECRET) ANALYTICS_HASH_SECRET=$(INTEGRATION_ANALYTICS_HASH_SECRET) $(INTEGRATION_COMPOSE) up -d --wait postgres redis localstack; \
	docker run --rm -t \
		--network "$(INTEGRATION_NETWORK)" \
		-v "$(PWD):$(WORKDIR)" \
		-w "$(WORKDIR)" \
		-e RUN_INTEGRATION=1 \
		-e INTEGRATION_FLOW_SDK_MODULE="$(INTEGRATION_FLOW_SDK_MODULE)" \
		-e DB_HOST=postgres \
		-e DB_PORT=5432 \
		-e DB_USER=debugbundle \
		-e DB_PASSWORD=debugbundle \
		-e DB_NAME=debugbundle \
		-e REDIS_URL=redis://redis:6379 \
		-e S3_ENDPOINT=http://localstack:4566 \
		-e S3_REGION=us-east-1 \
		-e S3_BUCKET=debugbundle-raw-events \
		$(NODE_IMAGE) sh -lc "corepack enable && $(PNPM_INSTALL_RELAXED) && corepack pnpm db:bootstrap && corepack pnpm db:migrate && corepack pnpm vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=$(INTEGRATION_TEST_TIMEOUT) $(INTEGRATION_TEST_FILES)"

.PHONY: test-mixed-version-api
test-mixed-version-api: install
	bash scripts/verify-mixed-version-api.sh

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
	$(DOCKER_COMPOSE) --profile dev up

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

# Recreate only the frontend. API, worker and database state stay independent.
.PHONY: dev-mock dev-mock-off
dev-mock:
	DEBUGBUNDLE_DEV_MOCK=true WEB_BIND_HOST=127.0.0.1 WEB_PORT=5291 $(DOCKER_COMPOSE) --profile dev up -d --no-deps --force-recreate web
	@echo "Mock preview: http://localhost:5291/dashboard (restart make dev-mock to reset simulated edits)"

dev-mock-off:
	DEBUGBUNDLE_DEV_MOCK=false $(DOCKER_COMPOSE) --profile dev up -d --no-deps --force-recreate web

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

.PHONY: worker-memory-check
worker-memory-check:
	docker run --rm --memory=768m --cpus=1 \
		-v "$(PWD):$(WORKDIR):ro" -w "$(WORKDIR)" \
		$(NODE_IMAGE) node --expose-gc --import tsx scripts/check-worker-poll-memory.mjs

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

.PHONY: license-docs-check
license-docs-check:
	$(NODE_RUN) 'corepack pnpm vitest run tests/contracts/analytics-public-docs.test.ts tests/infrastructure/public-site-repo.test.ts'

.PHONY: public-site-artifacts
public-site-artifacts:
	$(NODE_RUN) 'corepack enable && corepack pnpm public-site:artifacts'

.PHONY: evidence-fixtures
evidence-fixtures:
	$(NODE_RUN) 'SDK_FIXTURE_TARGETS="$(SDK_FIXTURE_TARGETS)" corepack pnpm exec tsx scripts/sync-evidence-fixtures.ts $(FIXTURE_ARGS)'

.PHONY: license-site-check
license-site-check:
	$(MAKE) public-site-artifacts
	$(MAKE) -C site test build typecheck NODE_IMAGE=$(NODE_IMAGE)

.PHONY: mcp-ecosystem-check
mcp-ecosystem-check:
	$(NODE_RUN) 'corepack pnpm vitest run tests/apps/mcp/mcp-ecosystem-release.test.ts'

.PHONY: billing-ui-docs
billing-ui-docs:
	$(NODE_RUN) "corepack enable && cd apps/web && corepack pnpm dlx shadcn@latest docs dialog button"

.PHONY: billing-safety-web-build
billing-safety-web-build:
	$(NODE_RUN) "cd apps/web && node_modules/.bin/vite build --outDir /tmp/debugbundle-billing-web-build"

# Explicit opt-in runner: credentials must be test-only and the expected account
# is read back before creating exclusively disposable DebugBundle fixtures.
.PHONY: billing-stripe-test
billing-stripe-test:
	test -f .local-notes/stripe-test.env
	docker run --rm --env-file .local-notes/stripe-test.env -e RUN_STRIPE_TEST=1 -v "$(CURDIR):/workspace" -w /workspace node:24-alpine node_modules/.bin/tsx scripts/billing-stripe-test.ts

# Same test-only guards and cleanup as the provider matrix, with a bounded wait
# for the hosted challenge. No API payment fallback is used in this mode.
.PHONY: billing-stripe-hosted-test
billing-stripe-hosted-test:
	test -f .local-notes/stripe-test.env
	docker run --rm --env-file .local-notes/stripe-test.env -e RUN_STRIPE_TEST=1 -e STRIPE_TEST_HOSTED=1 -v "$(CURDIR):/workspace" -w /workspace node:24-alpine node_modules/.bin/tsx scripts/billing-stripe-test.ts

# Explicit test-mode browser journey through the dashboard, API and disposable
# PostgreSQL, with signed CLI webhook forwarding and scoped fixture cleanup.
.PHONY: billing-stripe-browser-test
billing-stripe-browser-test:
	sh scripts/test-billing-stripe-browser.sh
