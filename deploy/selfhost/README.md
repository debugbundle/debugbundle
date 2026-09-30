# Self-Host Topology Notes

This directory defines the self-host deployment baseline for DebugBundle.

## Goal

Self-host and local Docker setups must stay close to the hosted production model so the product remains lean to reason about and maintain.

That means local development and self-host should preserve these boundaries even when everything runs on a single machine:

- web SPA as its own service
- API as its own service
- worker as its own service
- PostgreSQL as its own stateful service
- Redis as its own stateful service
- S3-compatible object storage as its own service

The public marketing/docs/blog site is separate from this core self-host topology. Under the current plan it will be a static-exported Next.js + Fumadocs artifact that can be served from object storage + CDN or any equivalent static host, without changing the product-service boundaries below.

## Auth Parity

Local/self-host auth behavior must match hosted behavior:

- SPA uses first-party cookie-backed sessions
- CLI and MCP use member-token auth through the API
- SDK ingestion uses project tokens only

Local convenience must not introduce a different auth model than hosted deployment.

## Quick Start

1. Copy the checked-in defaults and set the required probe-trigger secret:

   ```sh
   cp .env.example .env
   ```

2. Start the self-host stack:

   ```sh
   docker compose up -d
   ```

3. Wait for the stack to become healthy:

   ```sh
   docker compose ps
   ```

4. Run the shipped smoke flow to prove member bootstrap, project-token ingestion, worker processing, browser analytics rollups, retained journeys, and both bundle families:

   ```sh
   make selfhost-smoke
   ```

The compose file now brings up the full authenticated product surface:

- `workspace-init` installs the monorepo workspace once inside the repo checkout
- `db-bootstrap` creates a clean empty schema, `db-migrate` applies ordered forward migrations, and `api` starts only after both complete
- `worker` starts only after the API is healthy, so it sees a migrated database
- `localstack` bootstraps the raw-event bucket automatically via `localstack-init/01-create-bucket.sh`
- `web` serves the built SPA on the configured host port

This keeps self-host close to the hosted production shape while still allowing operators to deploy from a checked-out repo artifact.

## Self-Host Mode

Set `SELFHOST_MODE=true` on API and Worker services to bypass all billing/quota enforcement:

```env
SELFHOST_MODE=true
DEBUGBUNDLE_PROBE_TRIGGER_SECRET=replace-with-a-long-random-secret
ANALYTICS_HASH_SECRET=replace-with-a-long-random-secret
```

When enabled:

- All tier-gated features are unlocked (remote probes, GitHub automation, member invites, etc.)
- Ingestion rate limits and monthly quota checks are skipped
- Projects remain unlimited
- Auth and security remain fully enforced — only billing gates are bypassed
- Billing/upgrade UI in the web dashboard can be hidden (the API will not enforce plan limits regardless)

This env var is the only mechanism for self-host mode. It is not stored in the database and cannot be toggled by API calls.

`DEBUGBUNDLE_PROBE_TRIGGER_SECRET` is required on the API service. The API now refuses to start without it so probe-trigger signing cannot silently fall back to an in-repo default.

`ANALYTICS_HASH_SECRET` is required on API and Worker services. It signs deletion-safe account analytics identifiers; keep it stable across restarts and backups, and rotate only with a deliberate migration plan.

## Runtime Configuration

The checked-in `.env.example` includes the baseline configuration needed to boot the stack:

- `APP_BASE_URL`, `API_PORT`, and `WEB_PORT` define the browser and API entrypoints
- `POSTGRES_*`, `REDIS_PORT`, `LOCALSTACK_PORT`, `S3_REGION`, and `S3_BUCKET` define the stateful services
- `DEBUGBUNDLE_PROBE_TRIGGER_SECRET` is mandatory
- `ANALYTICS_HASH_SECRET` is mandatory
- `ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS` controls the bounded aggregate-only opportunity scan; it defaults to six hours
- `AUTH_COOKIE_SECURE=false` is the local default; set it to `true` behind HTTPS
- GitHub OAuth, GitHub App, and GitHub Marketplace webhook variables remain optional until those features are enabled

Default local endpoints after `docker compose up -d`:

- Web SPA: `http://localhost:5291`
- API: `http://localhost:3004`
- Postgres: `localhost:5434`
- Redis: `localhost:6380`
- LocalStack S3: `http://localhost:4567`

## AnalyticsBundle Operations

AnalyticsBundle is disabled per project until an owner or admin enables it through the authenticated API, CLI, MCP, or web settings surface. Self-host mode removes tier and allowance enforcement, but it does not bypass consent, privacy, validation, redaction, or retention controls.

Analytics data uses three independent project settings:

| Setting                      | Range        | What expires                                                                          |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `raw_retention_days`         | 1-30 days    | Short-lived raw analytics input objects and ingestion-ledger entries.                 |
| `sample_retention_days`      | 1-365 days   | Retained redacted representative journey samples and their object-storage artifacts.  |
| `aggregate_retention_months` | 1-120 months | Aggregate rollups, completed/failed AnalyticsBundle generations, and their artifacts. |

The worker cleanup lane deletes expired objects and metadata automatically. Aggregate metrics remain the normal query model; no analytics raw-event search surface exists. Generated journey timelines contain only redacted safe fields, and incident-impact replay remains restricted to correlation-backed retained samples.

`ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS` controls the additional idle, aggregate-only opportunity scan. It is six hours by default, uses a distributed lease and cursor-bounded batches, and never scans raw analytics objects. Event-triggered aggregation remains the low-latency evaluation path.

For an existing installation, deploy the current `db-migrate` service before API or Worker containers that use AnalyticsBundle tables. Do not run `db-bootstrap` as an upgrade mechanism: it is only for empty databases. Preserve `ANALYTICS_HASH_SECRET` across deploys because it protects deletion-safe account analytics identifiers and their deduplication continuity; it is not the incident-impact correlation hash.

## Health Checks

Every long-running service has a health check:

- PostgreSQL uses `pg_isready`
- Redis uses `redis-cli ping`
- LocalStack verifies the configured raw-event bucket exists
- API checks `GET /ready`, which now re-validates database schema, Redis connectivity, and the configured S3 bucket before reporting ready
- Worker checks its internal `GET /ready` endpoint, which re-validates required worker tables, Redis connectivity, and the configured S3 bucket before reporting ready
- Web checks the served SPA root

Because the API waits on Postgres, Redis, LocalStack, and the workspace install step, `docker compose ps` is enough to confirm that the bootstrap sequence completed.

## Startup Validation

Both application runtimes now fail fast during startup if a required self-host dependency is not actually usable:

- the API validates required database tables, Redis reachability, and S3 bucket access before binding its port
- the worker validates required worker tables, Redis reachability, and S3 bucket access before entering the job loop
- readiness endpoints keep checking those dependencies after startup, so Compose health reflects real dependency loss instead of only a live process

Typical failure reasons now surface explicitly in container logs, for example:

- `db_schema_missing_tables: ...`
- `api_redis_unreachable: ...`
- `api_s3_bucket_unreachable: ...`
- `worker_redis_not_ready`
- `worker_s3_bucket_unreachable: ...`

## Smoke Verification

`make selfhost-smoke` boots the full self-host stack in an isolated Compose project, waits for API and web readiness, then runs the checked-in smoke runner at `scripts/selfhost-smoke.ts`.

That smoke flow proves the core hosted-parity path end to end:

- dev-only GitHub bootstrap to a write-once member token inside the isolated smoke environment
- project creation and project-token minting through the member-authenticated management API
- `POST /v1/events` ingestion with the minted project token
- worker-owned incident creation and bundle generation
- member-authenticated incident and bundle retrieval
- three realistic browser analytics sessions spanning desktop/mobile, browser, OS, language, route, action, funnel, conversion, and journey-marker signals
- asynchronous analytics rollups, device breakdowns, funnel visibility, and retained representative journey metadata
- on-demand `analytics_bundle.v1` generation and retrieval

Use it after changing self-host compose config, auth wiring, ingestion, analytics storage/processing, worker startup behavior, or object-store/bootstrap behavior. The GitHub mock provider is enabled only for this isolated acceptance target; normal self-host deployments keep it disabled unless explicitly configured.

## Updating

Update the checked-out repo, then recreate the application services:

```sh
git pull
docker compose up -d --force-recreate workspace-init db-bootstrap db-migrate api worker web
```

No manual schema command is required on clean startup. The one-shot `db-bootstrap` service bootstraps an empty database before the API starts, and the one-shot `db-migrate` service applies ordered forward migrations before runtime services consume the schema. This is required for additive runtime-dependent changes such as the no-card trial lifecycle worker and AnalyticsBundle incident-correlation storage; API and worker readiness fail closed until their required migrations are recorded. Destructive schema cleanup should be shipped in a later deploy after additive migrations and compatible application code are already live.

## GitHub App Setup (Optional)

GitHub automation is optional. If you want DebugBundle to dispatch `repository_dispatch` events to your repositories on new incidents, you need to create a custom GitHub App under your own GitHub organization.

### 1. Create a GitHub App

Go to **Settings → Developer settings → GitHub Apps → New GitHub App** in your GitHub organization (or personal account).

Configure the app with these settings:

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **App name**       | Any name (e.g. `DebugBundle Self-Host`)                     |
| **Homepage URL**   | Your DebugBundle web app URL                                |
| **Callback URL**   | `https://<your-api-host>/v1/github/app/callback`            |
| **Webhook URL**    | `https://<your-api-host>/v1/github/app/webhook`             |
| **Webhook secret** | A random secret (save this for `GITHUB_APP_WEBHOOK_SECRET`) |

### 2. Set Permissions

Under **Permissions & events**, set:

| Permission                | Access    |
| ------------------------- | --------- |
| **Repository → Contents** | Read-only |
| **Repository → Metadata** | Read-only |

No other permissions are required. DebugBundle only reads repository metadata and sends `repository_dispatch` events.

### 3. Generate a Private Key

After creating the app, go to the app settings page and click **Generate a private key**. Download the `.pem` file.

### 4. Note the App ID and Client Credentials

From your GitHub App's settings page, record:

- **App ID** (shown at the top)
- **Client ID** (under "About" → "Client ID")
- **Client secret** (generate one under "Client secrets")

### 5. Set Environment Variables

Add the following to your API and worker service environments:

```env
GITHUB_APP_ID=<your-app-id>
GITHUB_APP_PRIVATE_KEY=<contents-of-the-pem-file>
GITHUB_APP_WEBHOOK_SECRET=<the-webhook-secret-you-chose>
GITHUB_APP_CLIENT_ID=<your-client-id>
GITHUB_APP_CLIENT_SECRET=<your-client-secret>
GITHUB_MARKETPLACE_WEBHOOK_SECRET=<your-github-marketplace-listing-webhook-secret>
```

For `GITHUB_APP_PRIVATE_KEY`, paste the full PEM contents including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines. In Docker, use a multi-line environment variable or mount the key file and reference it.

`GITHUB_MARKETPLACE_WEBHOOK_SECRET` is only needed when publishing the app through GitHub Marketplace. It signs the separate Marketplace listing webhook at `/v1/github/marketplace/webhook`; do not reuse `GITHUB_APP_WEBHOOK_SECRET`.

### 6. Install the App

Visit `https://github.com/apps/<your-app-slug>/installations/new` and install it on the organization/account whose repositories you want to connect.

### 7. Verify

After installation, the GitHub automation panel in Project Settings should show the connected installation. You can then assign repositories and configure dispatch rules.

### Network Requirements

- Your API must be reachable by GitHub for the installation callback (`/v1/github/app/callback`) and webhook delivery (`/v1/github/app/webhook`). This requires a public URL or a tunnel/proxy.
- The worker must be able to reach `https://api.github.com` to acquire installation tokens and send `repository_dispatch` events.

## Durable worker upgrade

The local semantic candidate additionally requires migrations `202609280021_add_analytics_subject_erasure_tasks` and `202609280022_add_subject_erasure_raw_outcome` before API/worker code reads the protected project-subject cutoff task or erased receipt outcome. Apply them through `db-migrate`, with ledger/readiness validation; bootstrap is only for an empty schema. The separately leased semantic catch-up worker owns bounded exact-key deletion and retry. The default API erasure route remains disabled. Retain these additive tables and receipt outcomes on rollback.

The candidate semantic analytics extension adds ordered migrations `202609280001_add_analytics_spaces`, `202609280002_add_analytics_writers`, `202609280003_add_analytics_project_catalogs`, `202609280004_add_analytics_project_plans`, `202609280005_add_analytics_space_plans`, `202609280006_add_semantic_analytics_receipts`, `202609280007_add_semantic_catalog_observations`, `202609280008_add_semantic_orphan_sweep_state`, `202609280009_add_business_measurement_policy`, `202609280010_add_semantic_raw_retention_state`, `202609280011_add_project_object_erasure_tasks` , `202609280012_add_semantic_analytics_loss_days`, `202609280013_add_semantic_funnel_facts`, `202609280014_add_analytics_project_identity_contexts`, `202609280015_add_semantic_producer_observations`, `202609280016_add_analytics_project_identity_revocations` `202609280017_add_semantic_identity_receipt_provenance` `202609280018_fence_analytics_identity_producer_epochs` `202609280019_index_semantic_receipt_subjects` and `202609280020_retain_analytics_identity_associations`. Run the normal `db-migrate` service before its API/worker code. Bootstrap preparation recognizes a populated predecessor and reports `db_bootstrap_skipped: existing_schema; run_db_migrate_required` without creating tables or seeding the ledger; the next migration service performs the upgrade. Partial initialization without the core installed-project tables still fails closed. The migrations add space membership/revision and project ownership/deletion guards, project-bound hashed writer credential metadata and public-only idempotency receipts, immutable project catalog entry revisions, current and historical project plan/report revisions with prospective availability, source-complete space-plan declarations, separate V2 receipt/operation/pending-object identities, bounded aggregate semantic source observations, a resumable S3 orphan-scan cursor, a default-false reviewed project business-purpose grant, accepted-raw deletion state with indexes for bounded cleanup and receipt pruning, a transactional project-delete trigger with a durable object-erasure journal, and bounded payload-free project/day semantic loss counts. Required tables/columns and all twenty semantic migration ledger entries are readiness-checked. The V1 saved-funnel create path reads the new plan table for the shared capacity check, so it must not start before migration. Retain these additive objects on application rollback; the old V1 payload shape is unchanged. The additive semantic migrations and internal S3/receipt/observation paths do not enable V2 ingress by themselves. The existing worker retention schedule invokes bounded staged-object, late-write object-scan, observation-aggregate, accepted-raw and expired-receipt cleanup. An independently leased one-minute semantic-only catch-up job handles accepted-raw and expired-receipt backlog without increasing the installed V1 schedule; it has ten-batch and 30-second start limits. Individual failed S3 deletes retry after five minutes. Project/account deletion also leaves a durable task that the worker drains one leased 100-key prefix page per pass; a delayed verification scan and daily late-write scans remain scheduled through 90 days. Run the migration before API or worker startup, and retain the task table and trigger on application rollback so in-flight erasure work is not lost. A failed S3 delete keeps the accepted receipt in deleting state for retry; the first lost-job transition atomically records a project/day quality marker that survives receipt pruning and expires under aggregate retention; business-operation dedupe keys remain until project deletion. New SDK capture stays disabled until the complete negotiated feature, authenticated ingress and a fully fenced scheduled V2 processor are available. Qualify report-quality loss handling and individual erasure before enabling semantic capture; maximum-volume cleanup tuning is deferred until usage warrants it.

The thirteenth through twentieth semantic migrations add protected project funnel facts, a current project identity namespace and five-minute relay contexts, submitted producer-version observations, minimal durable context and producer-epoch revocation fences, nullable context/writer/epoch IDs on accepted receipts, a protected subject-reference index attached to those receipts, and 90-day protected anonymous-to-known association edges independent of five-minute contexts. The revocation migrations backfill revoked context and epoch rows; short-lived context pruning does not remove those fences, and project deletion cascades them. Receipt epochs are backfilled from retained context or revocation rows; subject rows are backfilled only from a matching retained context, and association edges only from retained known associations. Older receipts without recoverable provenance fail closed at worker/report time. Apply `db-migrate` before the new API or worker; migration-ledger readiness fails closed when any required migration is missing. Retain these additive objects on application rollback. The semantic-only catch-up lane also prunes expired association edges. Bounded physical subject erasure, connected reporting and complete source/loss quality remain activation gates.

`SEMANTIC_ANALYTICS_RETENTION_INTERVAL_MS` controls the candidate catch-up schedule (default `60000`, allowed `60000` to `86400000` milliseconds). It does not change `RETENTION_CLEANUP_INTERVAL_MS` or the per-run batch and time limits. Keep the default until local load and worker-contention measurements justify a different cadence.

The durable worker release requires forward migration `202609130001_add_durable_worker_jobs`. Use the normal `db-migrate` dependency before starting the new worker; do not bootstrap an existing database. Pending work moves from Redis into Postgres when the worker adopts it. Internal worker `/ready` reports `worker_job_protocol: postgres-v1` and `processing_enabled: true` during normal processing. Self-host startup leaves `WORKER_START_PAUSED` at its compatible default `0`.

Keep a compatible `postgres-v1` worker after upgrade, including during an API rollback: Redis-only workers cannot consume existing Postgres jobs. Start with one incident worker; adding replicas requires separate artifact-publication and capacity validation. Inspect/retry scoped failed jobs with the internal `make worker-jobs` workflow in [the worker durability specification](../../spec/worker-durability.md). Preserve database and Redis persistence/backup settings; worker adoption does not make the preceding S3/Redis ingestion handoff atomic.

### Browser recovery and alert noise controls (core 1.12.0)

Apply `db-migrate` before the new API and worker start. Migration `202609220001_add_browser_recovery_context` adds an expiring correlation-reference index and nullable alert coalescing keys. It is additive and compatible with the previous runtime; do not drop these additions on rollback. Runtime readiness rejects a missing migration. The existing Compose migration dependency handles clean installs and upgrades; `db-bootstrap` is not an upgrade command.
