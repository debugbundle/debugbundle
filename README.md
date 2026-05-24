# DebugBundle

Production debugging bundles for AI agents.

![CI](https://img.shields.io/github/actions/workflow/status/debugbundle/debugbundle/ci.yml?branch=main&label=ci)
![CLI](https://img.shields.io/npm/v/%40debugbundle%2Fcli?label=cli&color=blue)
![MCP](https://img.shields.io/npm/v/%40debugbundle%2Fmcp?label=mcp&color=blue)
![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)
![Community](https://img.shields.io/badge/community-GitHub%20Discussions-black)

DebugBundle captures runtime failures, groups them into incidents, and publishes deterministic debug bundles for humans and AI agents.

## Why DebugBundle?

Modern AI agents are useful only when they get enough trustworthy context. DebugBundle packages the facts around a production incident into a versioned bundle instead of leaving agents to scrape dashboards, logs, traces, and chat threads.

Key properties:

- **Agent-native bundles:** deterministic failure and improvement bundles with errors, requests, responses, logs, frontend context, deploy metadata, runtime details, and reproduction hints.
- **Interface parity:** API, CLI, and MCP expose the same incident, bundle, probe, webhook, alert, project, and automation workflows.
- **Local-first setup:** start without a cloud account by writing events to `.debugbundle/local/events/`, then connect to DebugBundle Cloud when ready.
- **Safe SDKs:** SDK failures are swallowed internally, sensitive fields are redacted before transport, and duplicate storms are suppressed locally.
- **Self-hostable core:** Compose-based stack for the web app, API, worker, Postgres, Redis, and S3-compatible object storage.

## Quick Start

Choose the path that matches how you want to evaluate DebugBundle.

### Cloud

Use Cloud when you are preparing a hosted deployment or want team-visible incidents, alerts, webhooks, GitHub automation, API access, and MCP access.

```bash
npm install -g @debugbundle/cli
debugbundle setup
debugbundle login
debugbundle connect
```

`debugbundle connect` creates or selects a cloud project, creates a write-only project token, and updates `.debugbundle/local/connection.json`. Put the shown project token in your hosted environment:

```bash
DEBUGBUNDLE_PROJECT_TOKEN=dbundle_proj_xxxxxxxxxxxx
```

Add the smallest SDK or ingestion path that matches your app, deploy it with the token configured, then verify ingestion:

```bash
debugbundle verify cloud --project-id proj_01HXYZ... --trigger-5xx
debugbundle incidents --source cloud
debugbundle inspect inc_01HXYZ...
```

See the full [Cloud quickstart](https://debugbundle.com/docs/quickstart) and [connect-to-cloud guide](https://debugbundle.com/docs/project-setup/connect-to-cloud).

### Local-only

Use local-only mode when you want all captured data and bundles to stay on your machine.

```bash
npm install -g @debugbundle/cli
debugbundle setup --project-mode local-only
```

Initialize an SDK in local mode where supported, or use `debugbundle watch` for existing logs. After triggering a test error:

```bash
debugbundle process
debugbundle incidents --source local
debugbundle inspect inc_local_...
```

Local events are written under `.debugbundle/local/events/`; generated bundles are written under `.debugbundle/bundles/`. See the [local-only guide](https://debugbundle.com/docs/project-setup/local-only).

## Install an SDK

All SDKs follow the same universal interface: `init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `probe`, and `flush`.

| Runtime | Package | Install | Main docs |
| --- | --- | --- | --- |
| Node.js | `@debugbundle/sdk-node` | `npm install @debugbundle/sdk-node` | [Node.js SDK](https://debugbundle.com/docs/sdks/node) |
| Browser | `@debugbundle/sdk-browser` | `npm install @debugbundle/sdk-browser` | [Browser SDK](https://debugbundle.com/docs/sdks/browser) |
| Python | `debugbundle-python` | `pip install debugbundle-python` | [Python SDK](https://debugbundle.com/docs/sdks/python) |
| PHP | `debugbundle/sdk-php` | `composer require debugbundle/sdk-php` | [PHP SDK](https://debugbundle.com/docs/sdks/php) |
| Ruby | `debugbundle` | `gem install debugbundle` | [Ruby SDK](https://debugbundle.com/docs/sdks/ruby) |
| Java | `com.debugbundle:debugbundle-spring-boot-starter` | Maven or Gradle dependency | [Java SDK](https://debugbundle.com/docs/sdks/java) |
| Go | `github.com/debugbundle/debugbundle-go` | `go get github.com/debugbundle/debugbundle-go` | [Go SDK](https://debugbundle.com/docs/sdks/go) |
| WordPress | `debugbundle-wordpress` | GitHub Release ZIP | [WordPress plugin](https://debugbundle.com/docs/integrations/wordpress) |

### Node.js

```bash
npm install @debugbundle/sdk-node
```

```typescript
import { debugbundle } from '@debugbundle/sdk-node';

debugbundle.init({
  projectToken: process.env.DEBUGBUNDLE_PROJECT_TOKEN,
  environment: 'production',
  service: 'api',
});

debugbundle.captureExceptions();
debugbundle.captureRejections();
```

Express, Fastify, Next.js, pino, winston, bunyan, local file transport, remote capture policy, probes, and browser relay handlers are supported.

### Browser

```bash
npm install @debugbundle/sdk-browser
```

```typescript
import { createDebugBundleBrowserSdk } from '@debugbundle/sdk-browser';

const debugbundle = createDebugBundleBrowserSdk();

debugbundle.init({
  endpoint: '/debugbundle/browser',
  environment: 'production',
  service: 'web',
});
```

For full-stack apps, prefer the same-origin browser relay so project tokens stay server-side. Frontend-only deployments can send directly to DebugBundle Cloud with a dedicated public write-only token and an allowed-origin restriction. See [Browser Relay Setup](https://debugbundle.com/docs/sdks/browser-relay).

### Python

```bash
pip install debugbundle-python
```

```python
import os
import debugbundle

debugbundle.init(
    project_token=os.environ["DEBUGBUNDLE_PROJECT_TOKEN"],
    environment="production",
    service="api",
)

debugbundle.capture_exceptions()
debugbundle.capture_logging()
```

Django, Flask, FastAPI, Python logging, structlog, loguru, local file transport, remote capture policy, probes, and browser relay helpers are supported.

### PHP

```bash
composer require debugbundle/sdk-php
```

```php
<?php

use DebugBundle\DebugBundle;

DebugBundle::init([
    'projectToken' => getenv('DEBUGBUNDLE_PROJECT_TOKEN'),
    'environment' => 'production',
    'service' => 'api',
]);

DebugBundle::captureErrors();
DebugBundle::captureExceptions();
DebugBundle::captureShutdown();
```

Laravel, Symfony, Monolog, local file transport, remote capture policy, probes, and browser relay adapters are supported.

### Ruby

```bash
gem install debugbundle
```

```ruby
require "debugbundle"

DebugBundle.init(
  project_token: ENV["DEBUGBUNDLE_PROJECT_TOKEN"],
  environment: "production",
  service: "api"
)

DebugBundle.capture_exceptions
```

Rails, Rack, Sidekiq, Ruby Logger, Semantic Logger, local file transport, remote capture policy, probes, and browser relay handlers are supported.

### Java

```xml
<dependency>
  <groupId>com.debugbundle</groupId>
  <artifactId>debugbundle-spring-boot-starter</artifactId>
  <version>0.1.0</version>
</dependency>
```

```yaml
debugbundle:
  project-token: ${DEBUGBUNDLE_PROJECT_TOKEN}
  environment: production
  service: api
  project-mode: connected
```

The Spring Boot starter supports servlet request capture, MVC exception capture, Logback capture, remote config, probes, and an optional browser relay route.

### Go

```bash
go get github.com/debugbundle/debugbundle-go
```

```go
client := debugbundle.New(debugbundle.Config{
  ProjectToken: os.Getenv("DEBUGBUNDLE_PROJECT_TOKEN"),
  Environment:  "production",
  Service:      "api",
})
defer func() { _ = client.Flush(context.Background()) }()
```

net/http, Gin, Echo, slog, zap, zerolog, local file transport, remote capture policy, probes, and browser relay handlers are supported.

### WordPress

Install the plugin ZIP from the `debugbundle-wordpress` GitHub Release, then open **Settings -> DebugBundle** and save your project token. The plugin bundles backend PHP capture, frontend browser capture, and a WordPress REST relay so the project token stays server-side.

## CLI, API, and MCP

The CLI is the daily operational entry point:

```bash
npm install -g @debugbundle/cli
debugbundle setup
debugbundle doctor
debugbundle verify local
debugbundle verify cloud --trigger-5xx
debugbundle incidents
debugbundle inspect <incident-id>
```

Automation can use the HTTP API directly or the MCP server for agent workflows:

- API reference: <https://debugbundle.com/docs/api>
- CLI reference: <https://debugbundle.com/docs/cli>
- MCP docs: <https://debugbundle.com/docs/mcp>
- Bundle schema: <https://debugbundle.com/docs/bundles/schema>

## Repository Layout

```text
apps/
  api/       Fastify ingestion and retrieval API
  worker/    BullMQ processing worker for normalization, grouping, bundles, alerts, and webhooks
  cli/       @debugbundle/cli command-line interface
  mcp/       @debugbundle/mcp server for agent workflows
  web/       React/Vite app for interactive project and incident management
packages/
  auth/              Auth, sessions, token generation, token hashing
  bundle-engine/     Deterministic bundle assembly
  event-normalizer/  Event validation, normalization, classification, fingerprinting
  log-parser/        CLI log ingestion parser registry
  redaction/         Sensitive data scrubbing
  retrieval-client/  Shared retrieval API client used by CLI and MCP
  shared-types/      Zod schemas, TypeScript types, bundle/event contracts
  storage/           Postgres, Redis, S3-compatible storage adapters and migrations
sdks/
  debugbundle-js/         Local clone of the JS SDK repo
  debugbundle-python/     Local clone of the Python SDK repo
  debugbundle-php/        Local clone of the PHP SDK repo
  debugbundle-java/       Local clone of the Java SDK repo
  debugbundle-go/         Local clone of the Go SDK repo
  debugbundle-wordpress/  Local clone of the WordPress plugin repo
  debugbundle-ruby/       Local clone of the Ruby SDK repo
site/
  Public docs, marketing, reference, and blog site clone
```

The SDKs are standalone repositories under the `debugbundle` GitHub organization. This core repository owns the product services, shared contracts, CLI/MCP surfaces, and core-owned shared JS packages.

## Local Development

Use the Make targets so routine commands run in Docker-scoped environments.

```bash
make install
make infra-up
make infra-bootstrap
make dev
```

Local services:

| Service | Default |
| --- | --- |
| Web app | `http://localhost:5291` |
| API | `http://localhost:3003` |
| Postgres | `localhost:5434` |
| Redis | `localhost:6380` |
| LocalStack S3 | `localhost:4567` |

Useful checks:

```bash
make lint
make typecheck
make test
make build
make ci
```

`make dev` requires `DEBUGBUNDLE_PROBE_TRIGGER_SECRET` in `.env`. Start from `.env.example`, then keep local-only overrides in `.env.local` when needed.

## Self-Hosting

The supported self-host bootstrap lives in `deploy/selfhost/`.

```bash
git clone https://github.com/debugbundle/debugbundle.git
cd debugbundle/deploy/selfhost
cp .env.example .env
docker compose up -d
```

The self-host stack includes the web app, API, worker, PostgreSQL, Redis, and LocalStack S3. See [Self-Hosting](https://debugbundle.com/docs/self-hosting) and [deploy/selfhost/README.md](deploy/selfhost/README.md).

## Documentation

- Public docs: <https://debugbundle.com/docs>
- Quickstart: <https://debugbundle.com/docs/quickstart>
- Installation: <https://debugbundle.com/docs/installation>
- SDKs: <https://debugbundle.com/docs/sdks>
- Agent workflows: <https://debugbundle.com/docs/agent-workflows>
- System overview: [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)
- Architecture map: [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md)
- Requirements: [spec/requirements.md](spec/requirements.md)
- Acceptance criteria: [spec/acceptance.md](spec/acceptance.md)
- Public interfaces: [contracts/public-interfaces.md](contracts/public-interfaces.md)

## Release Model

The canonical public product release is the root `debugbundle` repository tag and GitHub Release (`v*`). Package-specific releases are separate:

- `cli-v*` for `@debugbundle/cli`
- `mcp-v*` for `@debugbundle/mcp`
- `shared-js-v*` for `@debugbundle/shared-types` and `@debugbundle/redaction`

Standalone SDK repositories publish and version their own release surfaces independently:

- `debugbundle-js` for `@debugbundle/sdk-node` and `@debugbundle/sdk-browser`
- `debugbundle-python` for `debugbundle-python`
- `debugbundle-php` for `debugbundle/sdk-php`
- `debugbundle-java` for Maven artifacts
- `debugbundle-go` for Go modules
- `debugbundle-wordpress` for the WordPress plugin

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. The short version:

- Keep app/package boundaries strict.
- Add or update tests for behavior changes.
- Run `make lint`, `make typecheck`, `make test`, and `make build` before asking for review.
- Update docs, contracts, and public interface references when behavior changes.

## Security

Do not report vulnerabilities in public issues. Use GitHub private vulnerability reporting for this repository:

<https://github.com/debugbundle/debugbundle/security/advisories/new>

See [SECURITY.md](SECURITY.md) for scope and response expectations.

## License

DebugBundle is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).
