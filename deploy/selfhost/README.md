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

| Setting | Range | What expires |
| --- | --- | --- |
| `raw_retention_days` | 1-30 days | Short-lived raw analytics input objects and ingestion-ledger entries. |
| `sample_retention_days` | 1-365 days | Retained redacted representative journey samples and their object-storage artifacts. |
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

| Field | Value |
|---|---|
| **App name** | Any name (e.g. `DebugBundle Self-Host`) |
| **Homepage URL** | Your DebugBundle web app URL |
| **Callback URL** | `https://<your-api-host>/v1/github/app/callback` |
| **Webhook URL** | `https://<your-api-host>/v1/github/app/webhook` |
| **Webhook secret** | A random secret (save this for `GITHUB_APP_WEBHOOK_SECRET`) |

### 2. Set Permissions

Under **Permissions & events**, set:

| Permission | Access |
|---|---|
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
