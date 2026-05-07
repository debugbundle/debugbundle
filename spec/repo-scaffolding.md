# Initial Repository Scaffolding — DebugBundle

> This defines the target directory structure for Phase 0 initialization.
> Not all directories will have code immediately — they are created to establish boundaries.

---

## Root Structure

```
/
├── AGENTS.md                          # Agent execution contract
├── SYSTEM_OVERVIEW.md                 # Context compression — system overview
├── ARCHITECTURE_MAP.md                # Context compression — module boundaries
├── LICENSE                            # AGPLv3
├── TRADEMARK.md                       # Trademark usage guidelines
├── README.md                          # Project overview + quickstart
├── package.json                       # Root workspace config
├── pnpm-workspace.yaml                # pnpm workspace definition
├── turbo.json                         # Turborepo pipeline config
├── tsconfig.base.json                 # Shared TypeScript base config
├── .eslintrc.cjs                      # Shared ESLint config
├── .prettierrc                        # Shared Prettier config
├── .env.example                       # All env vars documented
├── docker-compose.yml                 # Local dev: web, API, worker, Postgres, Redis, LocalStack S3
├── Dockerfile                         # Multi-stage build (shared base)
│
├── spec/                              # Merged specification layer
│   ├── product.md
│   ├── requirements.md
│   ├── acceptance.md
│   ├── architecture.md
│   └── implementation-roadmap.md
│
├── contracts/                         # Interface and schema contracts
│   ├── public-interfaces.md
│   └── data-schemas.md
│
├── rules/                             # Non-negotiable constraints
│   ├── coding-standards.md
│   ├── architectural-constraints.md
│   ├── domain-invariants.md
│   └── tdd-discipline.md
│
├── apps/
│   ├── api/                           # Fastify HTTP API
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── index.ts               # Fastify app entry
│   │   │   ├── server.ts              # Server bootstrap + graceful shutdown
│   │   │   ├── routes/
│   │   │   │   ├── health.ts          # GET /health, /ready, /live
│   │   │   │   ├── auth.ts            # POST /v1/auth/*
│   │   │   │   ├── ingestion.ts       # POST /v1/events
│   │   │   │   ├── incidents.ts       # GET /v1/incidents, /v1/incidents/{id}
│   │   │   │   ├── bundles.ts         # GET /v1/incidents/{id}/bundle
│   │   │   │   ├── reproductions.ts   # GET /v1/incidents/{id}/reproduction
│   │   │   │   ├── services.ts        # GET /v1/services
│   │   │   │   ├── alerts.ts          # CRUD /v1/alerts
│   │   │   │   └── webhooks.ts        # CRUD /v1/webhooks
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts            # Session/member/project auth middleware
│   │   │   │   ├── rate-limit.ts      # Rate limiting
│   │   │   │   └── error-handler.ts   # Structured error responses
│   │   │   └── plugins/
│   │   │       ├── db.ts              # Postgres connection plugin
│   │   │       ├── storage.ts         # S3/LocalStack client plugin
│   │   │       └── queue.ts           # Redis/BullMQ connection plugin
│   │   └── __tests__/
│   │
│   ├── worker/                        # BullMQ job processor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── index.ts               # Worker entry
│   │   │   ├── jobs/
│   │   │   │   ├── normalize-events.ts
│   │   │   │   ├── group-incident.ts
│   │   │   │   ├── build-bundle.ts
│   │   │   │   ├── build-reproduction.ts
│   │   │   │   ├── deliver-webhook.ts
│   │   │   │   ├── evaluate-alerts.ts
│   │   │   │   └── cleanup-retention.ts
│   │   │   └── queue.ts              # Queue definitions + registration
│   │   └── __tests__/
│   │
│   ├── cli/                           # CLI tool
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts               # CLI entry (commander/yargs)
│   │   │   ├── commands/
│   │   │   │   ├── login.ts
│   │   │   │   ├── init.ts
│   │   │   │   ├── doctor.ts
│   │   │   │   ├── validate.ts
│   │   │   │   ├── verify.ts
│   │   │   │   ├── incidents.ts
│   │   │   │   ├── inspect.ts
│   │   │   │   ├── bundle.ts
│   │   │   │   ├── reproduce.ts
│   │   │   │   ├── alert.ts
│   │   │   │   ├── webhook.ts
│   │   │   │   ├── services.ts
│   │   │   │   └── whoami.ts
│   │   │   ├── output/
│   │   │   │   ├── formatter.ts       # Human-readable / JSON output
│   │   │   │   └── exit-codes.ts      # Exit code constants
│   │   │   └── api-client.ts          # HTTP client for API calls with stored member auth
│   │   ├── __tests__/
│   │   └── __fixtures__/
│   │
│   ├── mcp/                           # MCP server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts               # MCP server entry (stdio transport)
│   │   │   ├── tools/
│   │   │   │   ├── incidents.ts
│   │   │   │   ├── bundles.ts
│   │   │   │   ├── reproductions.ts
│   │   │   │   ├── services.ts
│   │   │   │   ├── alerts.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   ├── profile.ts
│   │   │   │   └── setup.ts
│   │   │   └── api-client.ts          # HTTP client for API calls with reused CLI auth
│   │   ├── __tests__/
│   │   └── __fixtures__/
│   │
│   └── web/                           # React + Vite SPA (minimal)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── Dockerfile
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/
│       │   │   ├── providers/
│       │   │   │   ├── theme-provider.tsx
│       │   │   │   └── query-provider.tsx
│       │   │   ├── routes/
│       │   │   │   ├── login.tsx
│       │   │   │   ├── signup.tsx
│       │   │   │   ├── verify-email.tsx
│       │   │   │   ├── forgot-password.tsx
│       │   │   │   ├── reset-password.tsx
│       │   │   │   ├── projects.tsx
│       │   │   │   ├── tokens.tsx
│       │   │   │   ├── settings.tsx
│       │   │   │   └── billing.tsx
│       │   │   ├── router.tsx
│       │   │   └── layout/
│       │   ├── components/
│       │   │   ├── ui/               # shadcn/ui primitives
│       │   │   ├── blocks/           # reusable shadcn-style page blocks
│       │   │   ├── icons/
│       │   │   │   └── icon.tsx      # icon wrapper layer
│       │   │   └── auth/
│       │   └── lib/
│       │       └── api-client.ts
│       └── __tests__/
│
├── packages/
│   ├── shared-types/                  # Schemas, types, constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts               # Public re-exports
│   │   │   ├── schemas/
│   │   │   │   ├── event-envelope.ts
│   │   │   │   ├── event-payloads.ts
│   │   │   │   ├── bundle-v1.ts
│   │   │   │   ├── reproduction.ts
│   │   │   │   ├── incident.ts
│   │   │   │   ├── webhook-payload.ts
│   │   │   │   ├── profile.ts
│   │   │   │   └── api-responses.ts
│   │   │   ├── types/
│   │   │   │   └── index.ts           # Inferred TypeScript types
│   │   │   └── constants/
│   │   │       ├── event-types.ts
│   │   │       ├── bundle-types.ts
│   │   │       └── error-codes.ts
│   │   ├── __tests__/
│   │   └── __fixtures__/              # Canonical schema samples
│   │
│   ├── event-normalizer/              # Validation, normalization, fingerprinting
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── validate.ts
│   │   │   ├── normalize.ts
│   │   │   └── fingerprint.ts
│   │   ├── __tests__/
│   │   └── __fixtures__/
│   │
│   ├── bundle-engine/                 # Deterministic bundle assembly
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── build-bundle.ts
│   │   ├── __tests__/
│   │   └── __fixtures__/              # Golden bundle fixtures
│   │
│   ├── repro-engine/                  # Reproduction artifact generation
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── build-reproduction.ts
│   │   ├── __tests__/
│   │   └── __fixtures__/
│   │
│   ├── redaction/                     # Sensitive data scrubbing
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── rules.ts              # Default + custom redaction rules
│   │   │   └── redact.ts
│   │   └── __tests__/
│   │
│   ├── auth/                          # Sessions, passwords, verification, token generation, validation, middleware
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tokens.ts             # Generate, hash, validate member/project tokens
│   │   │   ├── email-auth.ts         # Email code issuance and verification challenges
│   │   │   ├── sessions.ts           # Session issuance and revocation
│   │   │   ├── verification.ts       # Email verification state and trust gating helpers
│   │   │   └── middleware.ts         # Fastify auth middleware
│   │   └── __tests__/
│   │
│   ├── email/                         # Email abstraction
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── templates/
│   │   │   │   ├── welcome.ts
│   │   │   │   ├── verify-email.ts
│   │   │   │   ├── password-reset.ts
│   │   │   │   └── alert-notification.ts
│   │   │   └── ses-adapter.ts
│   │   └── __tests__/
│   │
│   ├── sdk-node/                      # @debugbundle/sdk-node
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # Core SDK client
│   │   │   ├── capture.ts            # Exception/message capture
│   │   │   ├── transport.ts          # HTTP transport with batching/retry
│   │   │   ├── integrations/
│   │   │   │   ├── express.ts
│   │   │   │   ├── fastify.ts
│   │   │   │   └── nextjs.ts
│   │   │   └── utils/
│   │   │       ├── loop-protection.ts
│   │   │       └── deduplication.ts
│   │   └── __tests__/
│   │
│   └── sdk-browser/                   # @debugbundle/sdk-browser
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── client.ts
│       │   ├── capture.ts
│       │   ├── transport.ts           # HTTP + sendBeacon fallback
│       │   ├── collectors/
│       │   │   ├── console.ts
│       │   │   ├── network.ts
│       │   │   ├── navigation.ts
│       │   │   ├── dom.ts
│       │   │   ├── clicks.ts
│       │   │   └── forms.ts
│       │   └── utils/
│       │       ├── privacy.ts         # Form masking, payload sanitization
│       │       ├── loop-protection.ts
│       │       └── deduplication.ts
│       └── __tests__/
│
├── deploy/
│   └── selfhost/
│       ├── docker-compose.yml         # Web, API, Worker, Postgres, Redis, LocalStack S3
│       ├── .env.example
│       └── README.md
│
├── infra/
│   ├── docker/                        # Local dev Docker setup
│   │   └── docker-compose.yml         # Postgres, Redis, LocalStack S3 for local dev
│   └── migrations/                    # DB migrations (product code, ships with self-host)
│
├── docs/                              # Public documentation
│   ├── api/                           # API reference
│   ├── schemas/                       # Schema documentation
│   └── architecture/                  # Architecture guides
│
├── scripts/                           # Dev/CI utility scripts
│
├── evals/                             # Test suites
│   ├── unit/                          # Fast, isolated
│   ├── integration/                   # Cross-boundary
│   ├── behavioral/                    # Acceptance automation
│   └── regression/                    # Never-break
│
├── skills/                            # Agent skills (populated as needed)
│
└── starter-kit/                       # Original spec source (read-only reference)
    ├── start.md
    ├── agents-template.md
    └── specs-plans/
        └── ...
```

---

## Package Dependency Map (for `pnpm-workspace.yaml`)

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Internal Dependencies

| Package/App | Depends On |
|-------------|-----------|
| `shared-types` | (none) |
| `redaction` | `shared-types` |
| `auth` | `shared-types` |
| `email` | `shared-types` |
| `event-normalizer` | `shared-types`, `redaction` |
| `bundle-engine` | `shared-types`, `event-normalizer` |
| `repro-engine` | `shared-types`, `bundle-engine` |
| `sdk-node` | `shared-types`, `redaction` |
| `sdk-browser` | `shared-types`, `redaction` |
| `apps/api` | `shared-types`, `auth`, `event-normalizer`, `redaction` |
| `apps/worker` | `shared-types`, `event-normalizer`, `bundle-engine`, `repro-engine`, `redaction`, `email` |
| `apps/cli` | `shared-types`, `auth` |
| `apps/mcp` | `shared-types`, `auth` |
| `apps/web` | `shared-types` |

---

## Docker Compose Services (Local Dev)

```yaml
services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    depends_on: [api]
  api:
    build: ./apps/api
    ports: ["3001:3001"]
    depends_on: [postgres, redis, localstack]
  worker:
    build: ./apps/worker
    depends_on: [postgres, redis, localstack]
  postgres:
    image: postgres:15
    ports: ["5432:5432"]
    healthcheck: pg_isready
  redis:
    image: redis:7
    ports: ["6379:6379"]
    healthcheck: redis-cli ping
  localstack:
    image: localstack/localstack
    ports: ["9000:9000", "9001:9001"]
    command: server /data --console-address ":9001"
    healthcheck: curl -f http://localhost:4566/_localstack/health
```

---

## Environment Variables (`.env.example`)

```bash
# Database
DATABASE_URL=postgresql://debugbundle:debugbundle@localhost:5432/debugbundle

# Redis
REDIS_URL=redis://localhost:6379

# Object Storage (S3-compatible)
S3_ENDPOINT=http://localhost:4566
S3_ACCESS_KEY=test
S3_SECRET_KEY=test
S3_BUCKET=debugbundle
S3_REGION=us-east-1

# API
API_PORT=3001
API_HOST=0.0.0.0

# Worker
WORKER_CONCURRENCY=5

# Auth
TOKEN_SECRET=<random-secret-for-token-generation>
SESSION_SECRET=<random-secret-for-cookie-session-signing>
CSRF_SECRET=<random-secret-for-csrf-signing>

# Email (AWS SES)
SES_REGION=
SES_FROM_EMAIL=

# Billing (Stripe)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Web App
VITE_API_URL=http://localhost:3001

# Environment
NODE_ENV=development
```

---

## Repository Strategy (Public / Private Split)

This repo is the public core repo `debugbundle/debugbundle` for the complete DebugBundle product. This section describes the public repo layout only.

### What lives HERE today (public core repo)
- All application code (`apps/`, `packages/`)
- SDKs, CLI, MCP server
- Self-host deployment (`deploy/selfhost/`)
- Database migrations (`infra/migrations/`)
- Local dev Docker setup (`infra/docker/`)
- Documentation, specs, contracts, rules, tests

### What lives in this PUBLIC product repo
- Product application code and packages intended for open-source distribution
- SDKs, CLI, MCP server, public GitHub Action, and self-host assets
- Public docs, specs, contracts, rules, tests, and validation-only CI

### What lives in the PUBLIC site repo (`debugbundle/site`)
- The static docs/blog/marketing site currently used through the local `site/` clone
- Site-authored content and site-specific configuration
- Vendored generated artifacts exported from core for OpenAPI, schema, and reference pages
- Validation-only site CI

### Current SDK ownership nuance
- `debugbundle-python`, `debugbundle-php`, and `debugbundle/action` are now live dedicated org repos with fresh history because their source trees were already substantially separated from core product code.
- `debugbundle-js` can exist as its own org repo for the JS SDK surface, but `@debugbundle/shared-types` and `@debugbundle/redaction` remain core-owned source in the current workspace even though they are published as standalone npm packages.
- Treat those two packages as externally distributed core libraries for now. Moving their maintained source fully under `debugbundle-js` would be a later extraction effort, not an assumption built into the immediate public/private repo split.
- The local-workspace transition is now landed at the repo-contract level: core ships `sdks.json`, `scripts/bootstrap-sdks.sh`, and clone-root ignore rules, and the legacy SDK snapshot trees have been removed from the core repo index. Older long-lived local checkouts may still need one manual cleanup of pre-cutover `sdks/` directories before they bootstrap fresh clones.

### Deliberate Omission
Environment-specific deployment configuration, operational runbooks, infrastructure automation, monitoring setup, and other private operations details are intentionally outside this scaffolding document and outside the public product repo.

### Key Principles
- The cloud application IS the same code as the self-hosted application
- The site is a separate public repo, but its generated reference artifacts still originate from the core product repo
- Local Docker should mirror hosted service boundaries even when all services run on one machine
- Environment-specific operations details stay outside the public product repo
- The org-facing public split keeps product code and the static site separate without exposing private operations structure here

### Why This Split
- Community gets the full working product — nothing hidden
- Private operations details stay outside the public product surface
- 95% of development happens in this repo only
- Follows the standard open-core pattern (Supabase, PostHog, Cal.com)
