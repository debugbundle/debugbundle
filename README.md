# DebugBundle

Production debugging bundles for AI agents, with runtime error reporting and incident response.

![CI](https://img.shields.io/github/actions/workflow/status/debugbundle/debugbundle/ci.yml?branch=main&label=ci)
![CLI](https://img.shields.io/npm/v/%40debugbundle%2Fcli?label=cli&color=blue)
![MCP](https://img.shields.io/npm/v/%40debugbundle%2Fmcp?label=mcp&color=blue)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
[![Community](https://img.shields.io/badge/community-GitHub-blue)](https://github.com/debugbundle/debugbundle/issues)

DebugBundle provides runtime error reporting, crash reporting, incident response, endpoint health checks, and product analytics for humans and AI agents. It captures runtime failures, groups them into incidents, and publishes deterministic debug bundles. Its monitoring scope is customer-facing runtime behavior and endpoint health, not generic infrastructure metrics.

Works with AI coding agents including Codex, Claude Code, and Gemini CLI, as well as Cursor and GitHub Copilot. See the dedicated [Codex](https://debugbundle.com/docs/mcp/codex/), [Claude Code](https://debugbundle.com/docs/mcp/claude-code/), and [Gemini CLI](https://debugbundle.com/docs/mcp/gemini/) setup guides for native packages and direct MCP connections.

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

Use local-only mode when you want captured data and bundles to stay on the machine or storage volume where the SDK and CLI run.

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

SDKs share the same capture concepts through language-idiomatic APIs. Client constructors, framework configuration and plugin activation remain runtime-specific. Common operations include: `init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `probe`, and `flush`.

| Runtime      | Package                                           | Install                                        | Main docs                                                               |
| ------------ | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Node.js      | `@debugbundle/sdk-node`                           | `npm install @debugbundle/sdk-node`            | [Node.js SDK](https://debugbundle.com/docs/sdks/node)                   |
| Browser      | `@debugbundle/sdk-browser`                        | `npm install @debugbundle/sdk-browser`         | [Browser SDK](https://debugbundle.com/docs/sdks/browser)                |
| Python       | `debugbundle-python`                              | `pip install debugbundle-python`               | [Python SDK](https://debugbundle.com/docs/sdks/python)                  |
| PHP          | `debugbundle/sdk-php`                             | `composer require debugbundle/sdk-php`         | [PHP SDK](https://debugbundle.com/docs/sdks/php)                        |
| Rust | `debugbundle` | `cargo add debugbundle` | [Rust SDK](https://debugbundle.com/docs/sdks/rust) |
| Java         | `com.debugbundle:debugbundle-spring-boot-starter` | Maven or Gradle dependency                     | [Java SDK](https://debugbundle.com/docs/sdks/java)                      |
| .NET         | `DebugBundle.AspNetCore` / `DebugBundle.Sdk`      | `dotnet add package DebugBundle.AspNetCore`    | [.NET SDK](https://debugbundle.com/docs/sdks/dotnet)                    |
| Go           | `github.com/debugbundle/debugbundle-go/v3`           | `go get github.com/debugbundle/debugbundle-go/v3` | [Go SDK](https://debugbundle.com/docs/sdks/go)                          |
| Ruby         | `debugbundle`                                     | `gem install debugbundle`                      | [Ruby SDK](https://debugbundle.com/docs/sdks/ruby)                      |
| Android      | `com.debugbundle:debugbundle-android`             | Maven or Gradle dependency                     | [Android SDK](https://debugbundle.com/docs/sdks/android)                |
| iOS          | `DebugBundle`                                     | Swift Package Manager or CocoaPods             | [iOS SDK](https://debugbundle.com/docs/sdks/swift)                      |
| React Native | `@debugbundle/sdk-react-native`                   | `npm install @debugbundle/sdk-react-native`    | [React Native SDK](https://debugbundle.com/docs/sdks/react-native)      |
| WordPress    | `debugbundle`                           | WordPress.org plugin directory                 | [WordPress plugin](https://debugbundle.com/docs/integrations/wordpress) |

Initialize once at application startup. These connected examples use a server environment token, a browser relay or an explicitly configured mobile ingestion token. Verification and lifecycle details are in each SDK guide.

### Node.js

```bash
npm install @debugbundle/sdk-node
```

```typescript
import { debugbundle } from "@debugbundle/sdk-node";

debugbundle.init({
  projectToken: process.env.DEBUGBUNDLE_PROJECT_TOKEN,
  environment: "production",
  service: "api"
});
```

Initialize once at server startup with `DEBUGBUNDLE_PROJECT_TOKEN` set in the server environment. Initialization registers the process exception and rejection hooks; request middleware belongs in the framework setup below.

Express, Fastify, Next.js, pino, winston, bunyan and browser relay handlers are supported. See the [Node.js SDK guide](https://debugbundle.com/docs/sdks/node).

### Browser

```bash
npm install @debugbundle/sdk-browser
```

```typescript
import { createDebugBundleBrowserSdk } from "@debugbundle/sdk-browser";

const debugbundle = createDebugBundleBrowserSdk();
debugbundle.init({
  transportMode: "relay",
  endpoint: "/debugbundle/browser",
  environment: "production",
  service: "web"
});
```

Initialize once in the browser entry point. Configure the matching backend relay route first; this relative URL does not create a server endpoint. Keep the backend project token on the server.

Browser-native capture works with React, Next.js client components, Vue, Angular, Svelte and vanilla applications. Use a backend browser relay for this setup. See the [Browser SDK guide](https://debugbundle.com/docs/sdks/browser).

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
```

Initialize once at application startup with `DEBUGBUNDLE_PROJECT_TOKEN` set in the server environment. Initialization installs the exception hooks. Add logging and framework adapters in Integrations.

Django, Flask, FastAPI, Python logging, structlog, loguru and browser relay helpers are supported. See the [Python SDK guide](https://debugbundle.com/docs/sdks/python).

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
```

Initialize in your application bootstrap after loading Composer’s autoloader. Set `DEBUGBUNDLE_PROJECT_TOKEN` in the server environment, initialization installs error, exception and shutdown hooks. Add framework and logger adapters in Integrations.

Laravel, Symfony, Monolog and browser relay adapters are supported. See the [PHP SDK guide](https://debugbundle.com/docs/sdks/php).

### Rust

```bash
cargo add debugbundle
```

```rust
use debugbundle::Config;

let client = debugbundle::init(Config {
    project_token: std::env::var("DEBUGBUNDLE_PROJECT_TOKEN").unwrap_or_default(),
    environment: "production".into(),
    service: "api".into(),
    ..Config::default()
});
```

Run this in application startup and retain `client` for the application lifetime. Set `DEBUGBUNDLE_PROJECT_TOKEN` in the server environment. The example sets `environment` and `service` explicitly; `..Config::default()` supplies the remaining options. Initialization starts the client; panic observation and framework capture are explicit integrations. Flush only when verifying an event or during controlled shutdown.

Tokio, Tower, Axum and Actix Web, composable tracing/log integrations and browser relays are supported. See the [Rust SDK guide](https://debugbundle.com/docs/sdks/rust).

### Java

```xml
<dependency>
  <groupId>com.debugbundle</groupId>
  <artifactId>debugbundle-spring-boot-starter</artifactId>
  <version>3.1.4</version>
</dependency>
```

```yaml
debugbundle:
  project-token: ${DEBUGBUNDLE_PROJECT_TOKEN}
  environment: production
  service: api
  project-mode: connected
```

For Spring Boot 3, put this in `application.yml` and set `DEBUGBUNDLE_PROJECT_TOKEN` in the server environment. The starter initializes the client through Spring configuration. Other Java runtimes use the adapters below.

Spring Boot, servlet WARs, JAX-RS/RESTEasy, WildFly/JBoss, vanilla Java and the Java agent have runtime-specific setup. See the [Java SDK guide](https://debugbundle.com/docs/sdks/java).

### .NET

```bash
dotnet add package DebugBundle.AspNetCore
```

```csharp
using DebugBundle.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDebugBundle(options =>
{
    options.ProjectToken = builder.Configuration["DEBUGBUNDLE_PROJECT_TOKEN"];
    options.Environment = builder.Environment.EnvironmentName;
    options.Service = "api";
});

var app = builder.Build();
app.UseDebugBundle();
```

Add this to ASP.NET Core `Program.cs`, with `DEBUGBUNDLE_PROJECT_TOKEN` in application configuration. Keep your endpoint mappings and `app.Run()` after the middleware. The hosted service handles application shutdown.

ASP.NET Core, Microsoft.Extensions.Logging, gRPC, Worker Service, Hangfire, Azure Functions isolated worker and logging adapters have dedicated integrations. See the [.NET SDK guide](https://debugbundle.com/docs/sdks/dotnet).

### Go

```bash
go get github.com/debugbundle/debugbundle-go/v3
```

```go
import (
    "os"
    debugbundle "github.com/debugbundle/debugbundle-go/v3"
)

// Inside application startup:
client := debugbundle.New(debugbundle.Config{
    ProjectToken: os.Getenv("DEBUGBUNDLE_PROJECT_TOKEN"),
    Environment:  "production",
    Service:      "api",
})
```

Set `DEBUGBUNDLE_PROJECT_TOKEN` in the server environment and retain the client for your service lifetime. Add the imports to the file’s import block and create the client inside `main` or your bootstrap function. Use a bounded flush during controlled shutdown.

net/http, Gin, Echo, slog, zap, zerolog and browser relay handlers are supported. See the [Go SDK guide](https://debugbundle.com/docs/sdks/go).

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
```

Initialize once at application startup with `DEBUGBUNDLE_PROJECT_TOKEN` set in the server environment. Initialization arms best-effort process exception capture. Add framework and logger adapters below.

Rails, Rack, Sidekiq, Ruby Logger, Semantic Logger and browser relay handlers are supported. See the [Ruby SDK guide](https://debugbundle.com/docs/sdks/ruby).

### Android

```kotlin
dependencies {
    implementation(platform("com.debugbundle:debugbundle-android-bom:3.1.4"))
    implementation("com.debugbundle:debugbundle-android")
}
```

```kotlin
import com.debugbundle.android.DebugBundle
import com.debugbundle.android.DebugBundleConfig

// Inside Application.onCreate(), after super.onCreate():
DebugBundle.init(
    application = this,
    config = DebugBundleConfig(
        projectToken = BuildConfig.DEBUGBUNDLE_PROJECT_TOKEN,
        environment = "production",
        service = "android-app",
    ),
)
```

Call this from your registered `Application.onCreate()`. Define the app-owned `BuildConfig.DEBUGBUNDLE_PROJECT_TOKEN` field in Gradle. A token embedded in a mobile app is a public write-only ingestion credential, never a member token.

Native Android capture, crash/ANR replay, WorkManager, OkHttp, Ktor, Navigation, Compose and Timber integrations are available. See the [Android SDK guide](https://debugbundle.com/docs/sdks/android).

### iOS

```swift
.package(
    url: "https://github.com/debugbundle/debugbundle-swift",
    from: "3.1.5"
)
```

```swift
import Foundation
import DebugBundle

DebugBundle.initialize(
    DebugBundleConfig(
        projectToken: Bundle.main.debugBundleProjectToken,
        environment: "production",
        service: "ios-app"
    )
)
```

Add the Swift Package dependency to your application target. Initialize once from SwiftUI app initialization or UIKit launch, with `DebugBundleProjectToken` in Info.plist. Mobile tokens are public write-only ingestion credentials, never member tokens.

UIKit, SwiftUI, URLSession, Alamofire, SwiftLog, crash replay and offline queueing are supported. See the [iOS SDK guide](https://debugbundle.com/docs/sdks/swift).

### React Native

```bash
npm install @debugbundle/sdk-react-native
cd ios && pod install
```

```typescript
import { DebugBundle } from "@debugbundle/sdk-react-native";

DebugBundle.init({
  projectToken: process.env.EXPO_PUBLIC_DEBUGBUNDLE_TOKEN,
  environment: __DEV__ ? "development" : "production",
  service: "mobile-app"
});
```

Initialize once in the app entry point after completing native installation. This example uses Expo’s public environment-variable support; bare React Native apps supply the token through their own build configuration. Mobile tokens are public write-only ingestion credentials. Use a native development build: Expo Go cannot load the native SDK.

React error boundaries, React Navigation, scoped fetch/XHR instrumentation, Expo development builds and native Android/iOS queues are supported. See the [React Native SDK guide](https://debugbundle.com/docs/sdks/react-native).

### WordPress

Install **DebugBundle** from the [WordPress.org plugin directory](https://wordpress.org/plugins/debugbundle/), activate it, then open **Settings -> DebugBundle** and save your project token. The plugin bundles PHP and browser capture with a server-side relay. See the [WordPress guide](https://debugbundle.com/docs/integrations/wordpress) for integrations, first-event verification and configuration.

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
- MCP distribution channels: <https://debugbundle.com/docs/mcp/distribution>
- OpenAI Plugin candidate: <https://debugbundle.com/docs/mcp/openai-plugin>
- Bundle schema: <https://debugbundle.com/docs/bundles/schema>

Marketplace-managed MCP clients can run `npx @debugbundle/mcp` and provide `DEBUGBUNDLE_MEMBER_TOKEN` in the MCP server environment. The official MCP Registry name is `com.debugbundle/mcp`; project tokens are SDK write-only ingestion credentials and must not be used for MCP retrieval or management.

A separate OpenAI Plugin candidate pairs a debugging skill with an OAuth-protected, read-only remote MCP connection. It is available for owner-approved Developer Mode validation and is not yet publicly installable. See the [OpenAI Plugin guide](https://debugbundle.com/docs/mcp/openai-plugin) for candidate capabilities and validation status.

## AnalyticsBundle

AnalyticsBundle extends debugging from incident evidence to product-usage evidence without turning DebugBundle into a long-term raw-event store. It is opt-in browser analytics for the questions a human or agent needs to improve a product: visits and active users, routes and funnels, device/browser/OS/language segments, feature use, friction markers, incident impact, and bounded structured journey replay.

- **Ask directly:** API, CLI, and MCP expose aggregate metrics, journey patterns, opportunities, and generated AnalyticsBundles through the same project-authorized surface.
- **Generate by analysis unit:** bundles describe a usage, funnel, route, friction, conversion, deploy, or incident-impact question. DebugBundle does not create one AnalyticsBundle per visit.
- **Keep evidence explainable:** a generated bundle includes aggregate metrics, linked incidents/deploys, privacy-safe journey timelines, and deterministic journey-selection rank/basis for agent review.
- **Stay privacy- and cost-conscious:** raw analytics inputs and retained journey samples expire; long-lived usage is aggregate rollups. Debug capture remains independent when analytics is disabled, unavailable, sampled out, quota-limited, or unhealthy.

See the repository [public interface contract](contracts/public-interfaces.md#12b-analyticsbundle-and-product-analytics) for API/CLI/MCP parity and the [self-host guide](deploy/selfhost/README.md#analyticsbundle-operations) for retention and upgrade behavior.

## Public status pages

Project owners can publish selected health checks and their 30-day availability history on a public status page. Checks stay private until explicitly selected and published; endpoint URLs, errors, incidents, and account data remain private. See the [status-page guide](https://debugbundle.com/docs/availability-checks/#share-a-public-status-page) for setup and the [status-page contract](spec/public-status-pages.md) for API/CLI/MCP behavior and local verification.

## Repository Layout

Main areas of the workspace:

```text
apps/
  api/              Fastify ingestion and retrieval API
  worker/           Durable processing for events, bundles, analytics, reports, and notifications
  cli/              @debugbundle/cli command-line interface
  mcp/              @debugbundle/mcp server for agent workflows
  openclaw-plugin/   OpenClaw integration
  web/              React/Vite app for interactive project and incident management
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
  Local clones of the standalone SDK repositories listed in sdks.json
site/
  Public docs, marketing, reference, and blog site clone
```

The SDKs are standalone repositories under the `debugbundle` GitHub organization; [sdks.json](sdks.json) lists every maintained SDK repository. This core repository owns the product services, shared contracts, CLI/MCP surfaces, and core-owned shared JS packages.

## Local Development

Use the Make targets so routine commands run in Docker-scoped environments. Before starting, copy `.env.example` to `.env` if you do not already have one, and replace `DEBUGBUNDLE_PROBE_TRIGGER_SECRET` and `ANALYTICS_HASH_SECRET` with separate random secrets. Optional local overrides go in `.env.local`.

```bash
make install
make infra-up
make infra-bootstrap
make dev
```

Local services:

| Service       | Default                 |
| ------------- | ----------------------- |
| Web app       | `http://localhost:5291` |
| API           | `http://localhost:3003` |
| Postgres      | `localhost:5434`        |
| Redis         | `localhost:6380`        |
| LocalStack S3 | `localhost:4567`        |

Useful checks:

```bash
make lint
make typecheck
make test
make build
make ci
```

### Switch local tiers

With the normal local stack running, use these commands and refresh the dashboard:

```bash
make dev-tier                 # Show local workspaces and current tiers
make dev-tier TIER=business   # Also accepts free, solo or team
```

If you have several local workspaces, add `ORG=<organisation UUID>` from the
inspection output. This tests the real local API and base-tier allowances, setting
local extra capacity to zero. It only uses this checkout's local Compose Postgres
socket and refuses Stripe-linked accounts, trials and pending billing operations.
It makes no provider calls or usage-counter resets. Run `make dev-mock-off` first
if you are using the synthetic preview; reload after each tier change.

Normal retention and downgrade rules apply to the real local test data. Switching
away from Business pauses saved Smart Report schedules, which require Owner
review/resume after returning. Sharing permissions,
report consent and report/AI/email feature flags remain separately controlled.
The command does not simulate Checkout or prove payment flows. `make dev-tier-check`
tests its SQL guards in a disposable database.

### Populated UI preview

After `make install`, run `make dev-mock` and open <http://localhost:5291/dashboard>.
It restarts only the web container and automatically signs the preview in as
`demo@example.test`. Synthetic projects, incidents, improvements, 30-day health
history, alert/capture rules, webhook endpoints and delivery history, project and
access tokens, members/invitations, billing, provider connections, and GitHub
deliveries are served locally, so the data works in your ordinary browser.
SayCheese has analytics enabled with sample funnels, flows, journeys, opportunities
and generated artifacts. TaskTime includes empty and analytics-disabled states.

Project edits, incident/improvement actions, rule and health-check edits, webhook
creation/tests, token creation/revocation, invitations/member edits, probe
activation, weekly project digests, repository selection, and analytics settings/flows/
funnels/bundle generation and public status publication are simulated in memory.
Public status pages start private; select checks and publish in Project Health to
open a loopback share link. Mock project/check IDs use UUIDs so the normal strict
forms work, including newly created records. Publication choices paginate, new
checks remain private, and restarting resets publications along with other edits.
Failed-delivery clearing uses
the normal browser-only behavior. Billing checkout and portal links stay in the
local preview; capacity changes only update mock state. Mock credentials are
deliberately unusable with real installations. No real checks, notifications,
GitHub dispatches, OAuth interactions, payments or database writes are made.
Unknown API operations still return an explicit preview error without contacting
the backend. External provider authorization and private operator tools require
normal development. After a mock logout, use any valid email and code `123456` to
return to the demo account; the same code is used for simulated account deletion.

- Run `make dev-mock` again to reset the simulated server data. Browser preferences
  and cleared-delivery IDs remain in local storage; use **Show cleared** to inspect them.
- Open <http://localhost:5291/dashboard?welcome=1> to replay the dashboard welcome
  in the local demo. Reload that link to replay it again. **Account menu → Setup
  guide** opens the ongoing checklist. Progress still reflects the populated demo
  data; the link does not reset projects/tokens or operate against the real API.
- To review the whole onboarding layout, open
  <http://localhost:5291/dashboard?welcome=1&setup=empty> and dismiss the welcome:
  the sidebar reminder shows **0 of 3** above the account menu. Open
  <http://localhost:5291/dashboard?setup=started> for **1 of 3** with no modal.
  These local-only display scenarios last until the next full page load and do
  not overwrite saved setup preferences or change demo projects/tokens. Reload
  <http://localhost:5291/dashboard> to return to observed demo progress.
- Run `make dev-mock-off` to return the frontend to your real local API.
- The preview binds to loopback, blocks foreign origins and intercepts unknown API
  paths rather than forwarding them. It requires development serve mode, is absent
  from production builds and disables frontend telemetry even if local env enables it.

For the existing nginx static public preview at <http://localhost:5292>, use
`make dev-public-refresh`. It checks the preview's source mount, rebuilds the site,
restarts the preview container and checks its HTTP response. Rebuilding `site/out`
alone can leave nginx attached to the previous directory and returning 403.
This command is local only; it does not publish or deploy the site.

## Self-Hosting

The supported self-host bootstrap lives in `deploy/selfhost/`.

```bash
git clone https://github.com/debugbundle/debugbundle.git
cd debugbundle/deploy/selfhost
cp .env.example .env
docker compose up -d
```

The self-host stack includes the web app, API, worker, PostgreSQL, Redis, and LocalStack S3. See [Self-Hosting](https://debugbundle.com/docs/self-hosting), [deploy/selfhost/README.md](deploy/selfhost/README.md), and the [Compose configuration](deploy/selfhost/docker-compose.yml).

## Documentation

For bugs and feature requests, use [GitHub issues](https://github.com/debugbundle/debugbundle/issues). For account or billing help, [contact DebugBundle](https://debugbundle.com/contact).

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

Standalone SDK repositories publish and version their own release surfaces independently. See [sdks.json](sdks.json) for the complete repository list and the [release governance guide](rules/release-governance.md) for publication requirements.

The v1 release train publishes dependency roots before dependent wrappers:

1. Publish `@debugbundle/shared-types` and `@debugbundle/redaction` from the core repo first.
2. Publish `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` from `debugbundle-js` after the matching shared-package version exists on npm.
3. Publish independent SDK and package families whose artifacts do not bundle another DebugBundle SDK.
4. Publish React Native after the Android and iOS native SDK versions it delegates to are live and smoke-tested.
5. Publish WordPress after the PHP SDK and browser SDK versions it requires are live and smoke-tested, then rebuild the bundled browser asset.
6. Bump hosted dogfooding manifests only after the referenced registry versions exist.
7. Create the canonical core GitHub Release after package-specific release workflows pass.

Our own hosted/source-deployed dogfooding surfaces intentionally consume published packages rather than implicit workspace links. After a successful registry publish, bump the pinned versions in the root `package.json`, hosted app `apps/web/package.json`, and public-site `site/package.json` before running hosted validation or deployment.

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

DebugBundle core, SDKs, and executable developer tools use [Apache-2.0](LICENSE). Service-required exceptions are limited to the WordPress plugin (GPL-2.0-or-later) and portable ClawHub/Smithery instruction skill (MIT-0). See the [licensing policy](spec/licensing.md).
