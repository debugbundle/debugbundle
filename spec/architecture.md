# Architecture — DebugBundle

Version: v1
Last updated: 2026-05-08

---

## 1. Architecture Principle

DebugBundle is a **bundle-oriented debugging system**, not a generic observability platform.

The architecture optimizes for:

- Reliable signal capture
- Low-cost ingestion
- Deterministic bundle generation
- Compact storage
- Machine-readable retrieval
- Automation-friendly event delivery

The architecture does NOT optimize for arbitrary log search or dashboard-heavy analytics in V1.

---

## 2. Core System Layers

```
┌─────────────────────────────────────────┐
│           Application Runtime           │
│  (Node.js backend / Browser frontend)   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         SDK Capture Layer               │
│  sdk-node / sdk-browser                 │
│  Buffer → Batch → Ship normalized       │
│  events to Ingestion API                │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Ingestion Layer (API)           │
│  POST /v1/events                        │
│  Authenticate → Validate → Persist raw  │
│  events → Enqueue processing            │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
┌────────▼───────┐ ┌─────▼──────────────┐
│ Raw Event      │ │ Processing Queue   │
│ Storage (S3)   │ │ (Redis/BullMQ)     │
└────────────────┘ └─────┬──────────────┘
                         │
┌────────────────────────▼────────────────┐
│         Processing Layer (Worker)       │
│  Normalization → Grouping →             │
│  Bundle Generation → Reproduction →     │
│  Webhook Delivery → Cleanup             │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
┌────────▼───────┐ ┌─────▼──────────────┐
│ Bundle/Repro   │ │ Metadata Store     │
│ Storage (S3)   │ │ (PostgreSQL)       │
└────────────────┘ └─────┬──────────────┘
                         │
┌────────────────────────▼────────────────┐
│         Retrieval Layer                 │
│  HTTP API / CLI / MCP                   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Automation Layer                │
│  Webhooks / Email / Slack / Discord     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Consumer                        │
│  Human Developer / AI Agent             │
└─────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Primary Language
**TypeScript** — used across all components (API, worker, CLI, SDKs, MCP, web)

### Backend Runtime
**Node.js**

### API Framework
**Fastify** — strong TypeScript support, schema-oriented, high performance, low overhead

### Auth Model
**First-party auth** — browser session cookies for the SPA, member tokens for CLI/MCP/API automation, project tokens for SDK ingestion

### Database
**PostgreSQL** — relational metadata store (users, orgs, projects, members, tokens, services, deployments, incidents, bundle metadata, webhook metadata, delivery metadata, usage counters)

### Object Storage
**S3-compatible object storage** — raw event payloads, generated bundles, reproduction artifacts

### Queue / Cache
**Redis** — job queue state (BullMQ or similar), retries, rate limiting, short-lived caches

### Frontend Framework
**React + Vite + React Router** (TypeScript, Tailwind CSS) — minimal SPA web app with strict separation from the API

### Monorepo Tooling
**pnpm** + **turborepo**

### Email
**Provider-backed email delivery** via abstraction (`packages/email`)

### Billing
**Stripe**

---

## 4. Monorepo Structure

```
debugbundle/
├── apps/
│   ├── api/              # Fastify HTTP API + auth + billing + ingestion + retrieval
│   ├── worker/           # Async jobs: normalization, grouping, bundling, alerts, cleanup
│   ├── web/              # Minimal React + Vite SPA: auth, billing, settings
│   ├── cli/              # CLI binary (Commander or similar)
│   └── mcp/              # MCP server (thin adapter)
├── packages/
│   ├── sdk-node/         # @debugbundle/sdk-node
│   ├── sdk-browser/      # @debugbundle/sdk-browser
│   ├── bundle-engine/    # Bundle generation logic
│   ├── repro-engine/     # Reproduction artifact generation
│   ├── event-normalizer/ # Event validation + normalization
│   ├── shared-types/     # Shared TS types, schemas, constants
│   ├── auth/             # Shared auth domain helpers (sessions, passwords, verification)
│   ├── redaction/        # Shared redaction helpers and policies
│   └── email/            # Email service abstraction + providers
├── infra/
│   ├── docker/           # Local dev Docker setup (docker-compose.yml, Dockerfiles)
│   └── migrations/       # DB migrations (product code, ships with self-host)
├── deploy/
│   └── selfhost/         # docker-compose.yml, .env.example, README.md
├── docs/
│   ├── api/
│   ├── schemas/
│   └── architecture/
├── scripts/
├── spec/                 # Immutable intent layer
├── contracts/            # System boundary contracts
├── rules/                # Non-negotiable constraints
├── evals/                # Test suites
│   ├── unit/
│   ├── integration/
│   ├── behavioral/
│   └── regression/
└── package.json
```

---

## 5. Service Boundaries

### apps/api
- Auth (email-code request/verify, GitHub auth, logout, session, token management)
- Project token validation for ingestion
- Event ingestion (`POST /v1/events`)
- Incident reads/listing
- Bundle reads
- Reproduction reads
- Alert rule CRUD
- Webhook CRUD + test + delivery inspection
- Service/project metadata
- Billing / account endpoints
- Verification endpoints
- Health endpoints (`/health`, `/ready`, `/live`)

### apps/worker
- Event normalization (deferred if needed)
- Incident grouping (fingerprinting)
- Bundle generation (bundle-engine)
- Reproduction generation (repro-engine)
- Alert fanout (email/Slack/Discord/webhook)
- Webhook delivery (signed, retried)
- Retention cleanup jobs

### apps/cli
- Auth (member-token login and local auth-state reuse)
- Project setup (init, connect)
- Validation (doctor, validate, verify local/production, smoke)
- Data retrieval (incidents, inspect, bundle, reproduce, services)
- Alert management
- Webhook management
- Profile management (validate, show, sync)
- Human-readable + JSON output

### apps/mcp
- Thin adapter over core domain services
- Same schemas, validation, auth model as CLI/API
- Tools: list_incidents, get_bundle, get_reproduction, doctor, validate, verify, smoke, etc.

### apps/web
- Signup/Login (email-code, cookie-backed session)
- Billing (Stripe integration)
- Project/team settings
- Token management
- Webhook settings UI (convenience layer)
- Reusable shadcn-based UI primitives, blocks, theme support, and icon wrapper layer

---

## 6. Shared Packages

| Package | Purpose |
|---------|---------|
| `shared-types` | TypeScript types, event schemas, bundle schema, constants |
| `bundle-engine` | Deterministic bundle assembly from normalized events |
| `repro-engine` | Best-effort reproduction artifact generation |
| `event-normalizer` | Event validation, normalization, fingerprinting |
| `auth` | Shared auth domain helpers for sessions, passwords, verification, and tokens |
| `redaction` | Shared redaction config, rules, and helpers |
| `email` | Provider abstraction for transactional email delivery |

---

## 7. Data Flow

### Ingestion Path
1. SDK buffers events locally
2. SDK flushes batch to `POST /v1/events`
3. API authenticates project token
4. API validates event envelope
5. API persists raw events to object storage (`raw-events/{project_id}/...`)
6. API enqueues processing work to Redis
7. API returns accepted/rejected counts

### Processing Path
1. Worker dequeues `group-incident` job
2. Worker normalizes events (event-normalizer)
3. Worker computes fingerprint, groups into incident
4. Worker creates/updates incident metadata in Postgres
5. Worker enqueues `build-bundle` job
6. Worker generates bundle (bundle-engine) → stores to object storage
7. Worker generates reproduction (repro-engine) → stores to object storage
8. Worker enqueues `deliver-webhook` / `deliver-alert` jobs
9. Worker delivers webhooks (signed, with retry)

### Retrieval Path
1. CLI / API / MCP calls retrieval endpoint
2. API reads incident metadata from Postgres
3. API reads bundle artifacts from object storage
4. API returns structured JSON response

---

## 8. Storage Model

### PostgreSQL (Metadata)
- users, organizations, organization_members
- projects, project_tokens
- services, deployments
- incidents, incident_events
- alert_rules, agent_webhooks
- usage_counters
- webhook delivery state

### S3-Compatible Object Storage (Artifacts)
- `raw-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz`
- `bundles/{project_id}/{incident_id}/bundle.json.gz`
- `reproductions/{project_id}/{incident_id}/reproduction.json.gz`

### Redis (Queue/Cache)
- BullMQ job queues
- Retry state
- Rate limiting
- Short-lived caches

---

## 9. Deployment Model (V1)

This document keeps deployment guidance at the product-boundary level only. Environment-specific infrastructure choices, operational runbooks, and deployment automation are intentionally out of scope here.

| Component | Deployment Expectation |
|-----------|------------------------|
| App runtime | Containerized or process-based application runtime |
| API | Separate HTTP service boundary |
| Worker | Separate asynchronous processing boundary |
| Redis | Standard Redis service |
| PostgreSQL | Standard PostgreSQL service |
| Object Storage | S3-compatible object storage |
| Frontend Web App | Static authenticated SPA |
| Public Site | Static-exported site serving marketing, docs, blog, and public artifacts |
| Email | External transactional email provider |
| Billing | Stripe |

### Self-Host Stack
- Docker Compose must preserve the same service boundaries even when everything runs on one local machine.
- Target local stack: Web, API, Worker, PostgreSQL, Redis, LocalStack S3 (S3-compatible)
- The public marketing/docs/blog site is a separate static deployment artifact and is not required for core self-host product operation.
- Local auth behavior must match the standard product auth behavior: SPA session cookies, member-token CLI/MCP auth, project-token ingestion auth
- `deploy/selfhost/docker-compose.yml`

---

## 10. Interface Parity Rule

All important product capabilities must be available through:

- **HTTP API**
- **CLI**
- **MCP**

No capability that matters for automation may be dashboard-only.

All three interfaces call the same internal domain services. No interface has unique hidden behavior.

---

## 11. Security Boundaries

- **Project Tokens** — used by SDKs (write-only, project-scoped, cannot read bundles or manage account)
- **Member Tokens** — used by CLI/API/MCP/agents (read/manage within project access)
- **User Sessions** — used by web app (interactive browser usage)
- **Webhook Secrets** — used for payload signing (hashed at rest)

---

## 12. Event Types (V1)

| Type | Source |
|------|--------|
| `backend_exception` | Node SDK |
| `request_event` | Node SDK |
| `log_event` | Node SDK |
| `frontend_breadcrumb` | Browser SDK |
| `frontend_exception` | Browser SDK |
| `deploy_metadata` | SDK / CI |

---

## 13. Incident Severity Model

| Severity | Definition |
|----------|------------|
| `critical` | Blocks core flow or sustained 5xx spike |
| `high` | Repeated production exception affecting user flow |
| `medium` | Repeated error with limited impact |
| `low` | Noisy but low-impact issue |

System assigns default severity; manual override through API/web supported later.

---

## 14. Repository Scope

This architecture document describes the public product surface only.

### Public Core Repo (`debugbundle/debugbundle`)
Contains the open product runtime and source-of-truth product materials: apps, packages, self-host deployment, specs, contracts, rules, tests, and validation-only CI.

### Public Site Repo (`debugbundle/site`)
Contains the static docs/blog/marketing site. It may consume generated artifacts exported from the core repo, but it should not retain direct source imports from core after cutover.

### Deliberate Omission
Environment-specific deployment configuration, operational runbooks, infrastructure automation, monitoring setup, and other private operations details are intentionally outside this document and outside the public product surface.

---

## 15. Scalability Constraints

The V1 architecture must stay bundle-oriented and simple. Avoid adding prematurely:

- Kafka
- ClickHouse
- OpenSearch
- Kubernetes
- Tracing backends
- Arbitrary query engines

Scale when the product proves broader needs.
