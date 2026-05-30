# Documentation Specification — DebugBundle

Version: v1
Last updated: 2026-03-24
Status: APPROVED

> Source-of-truth for all public documentation content, structure, standards, and acceptance criteria.
> Referenced by: `AGENTS.md`, `spec/requirements.md` (FR-DOC-*), `spec/routes.md`

---

## 0. Why This Spec Exists

Documentation is the **#2 most critical surface** of DebugBundle after the core product. Without comprehensive, navigable, high-quality docs, adoption stalls regardless of product quality. This spec defines:

1. The **complete page tree** — every page that must exist at V1 launch
2. The **content standard** — what each page must contain
3. The **information architecture** — navigation, grouping, ordering
4. The **Fumadocs integration** — how content maps to the framework
5. The **acceptance criteria** — how to verify docs are complete

### Design Principles

- **Developer-first, agent-readable.** Every page must be scannable by a human developer and parseable by an AI agent. Prefer code examples over prose. Prefer tables over paragraphs.
- **Progressive disclosure.** Landing → Quickstart → Concept → Reference. Never force a reader through prerequisite pages to get value.
- **Copy-paste ready.** Every code example must be complete enough to copy-paste and run. No pseudocode. No `...` elisions in runnable examples.
- **Two installation paths.** Every setup guide must offer both agent-driven (give prompt to AI) and manual (step-by-step CLI) paths.
- **SDK parity.** Every SDK gets the same documentation depth. When an SDK is not yet shipped, the page exists as a clear "Coming Soon" placeholder with the expected interface contract.
- **Reference is generated, guides are authored.** Reference pages (API endpoints, CLI commands, MCP tools, webhook events, schemas) are generated from source. Guides, concepts, and tutorials are hand-authored.

---

## 1. Page Tree

The complete docs page tree for `/docs`. Every entry below is a page that must exist. Pages are grouped into sections with explicit ordering.

### 1.0 Root

| Path | Title | Type | Purpose |
|------|-------|------|---------|
| `/docs` | Documentation Home | Landing | Entry point. Hero section + section cards grid linking to each major area. |

### 1.1 Getting Started

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/what-is-debugbundle` | What is DebugBundle? | Concept | Product explanation: what it does, who it's for, what makes it different. Core thesis. Bundle artifact explained. Not a feature list — a mental model. |
| 2 | `/docs/quickstart` | Quickstart | Tutorial | Zero-to-first-bundle in <5 minutes. Two paths: agent-driven (copy prompt) and manual (CLI steps). Node.js + Express as the default example. Ends with "you just captured your first incident." |
| 3 | `/docs/how-it-works` | How It Works | Concept | The 4-stage lifecycle: Capture → Ship → Process → Retrieve. Architecture diagram. Explains SDK → Ingestion → Worker → Bundle → CLI/API/MCP. |
| 4 | `/docs/installation` | Installation | Guide | All installation methods: npm/pnpm/yarn for Node, pip for Python, composer for PHP, CDN/npm for browser. Self-host Docker Compose. CLI installation. |
| 5 | `/docs/core-concepts` | Core Concepts | Concept | The three primitives (bundle, incident, profile). Event types. Fingerprinting. Incident lifecycle (open → resolved → regressed). Bundle types (failure, improvement). |

### 1.2 SDKs

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/sdks` | SDKs Overview | Landing | SDK philosophy, universal interface table, language support matrix. Links to each SDK page. |
| 2 | `/docs/sdks/node` | Node.js SDK | Guide | Full guide: install, init, config options table, vanilla hooks, framework integrations (Express, Fastify, Next.js), logger integrations (pino, winston, bunyan), local-first transport, error handling, sampling, redaction, probes. Complete working examples for each framework. |
| 3 | `/docs/sdks/browser` | Browser SDK | Guide | Full guide: install, init, config options table, breadcrumb capture, error capture, network filtering, session controls, device context, trace correlation, relay transport vs static transport, unload-safe flushing, probes. |
| 4 | `/docs/sdks/python` | Python SDK | Guide | Full guide: install, init, vanilla hooks (sys.excepthook, logging, asyncio), framework integrations (Django, Flask, FastAPI), logger integrations (structlog, loguru), config options. |
| 5 | `/docs/sdks/php` | PHP SDK | Guide | Full guide: install, init, vanilla hooks (set_error_handler, set_exception_handler, register_shutdown_function), framework integrations (Laravel middleware, Symfony event subscriber), Monolog handler, config options. |
| 6 | `/docs/sdks/android` | Android SDK | Guide | Full guide: install, init, crash/ANR replay, lifecycle and navigation breadcrumbs, OkHttp/Ktor, offline queueing, WorkManager flushing, Timber, capture policy, probes, and privacy defaults. |
| 7 | `/docs/sdks/swift` | Swift SDK | Guide | Full guide: install through Swift Package Manager, SwiftUI and UIKit init, URLSession/Alamofire, offline queueing, SwiftLog, crash replay, capture policy, probes, and privacy defaults. |
| 8 | `/docs/sdks/dotnet` | .NET SDK | Guide | Full guide: install through NuGet, ASP.NET Core, Minimal APIs/MVC/Razor Pages, Blazor Server caveats, Microsoft.Extensions.Logging, Serilog, NLog, log4net, gRPC, Worker Service, Hangfire, Azure Functions isolated worker, browser relay, runtime support, probes, and privacy defaults. |
| 9 | `/docs/sdks/universal-interface` | Universal SDK Interface | Reference | The complete interface contract: every method, every config field, every behavior guarantee. Language comparison table. Volume control (suppression, loop protection, backoff). |
| 10 | `/docs/sdks/browser-relay` | Browser Relay Setup | Guide | How browser events reach DebugBundle: relay handler architecture, Express/Fastify/Next.js/ASP.NET Core relay setup, origin validation, credential isolation, static-only fallback for no-backend apps. |

### 1.3 CLI

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/cli` | CLI Overview | Landing | What the CLI does, installation, authentication (`debugbundle login`), global flags (`--json`, exit codes). |
| 2 | `/docs/cli/setup` | Setup & Configuration | Guide | `debugbundle setup` walkthrough (both interactive and agent-driven), profile generation, scaffold structure, `.debugbundle/` directory explained, `doctor`, `validate`, `verify`. |
| 3 | `/docs/cli/local-workflow` | Local Workflow | Guide | The complete local-only flow: setup → capture → process → inspect. `debugbundle process`, `debugbundle inspect`, `debugbundle resolve`, `debugbundle reopen`, `debugbundle clean`. No cloud account needed. |
| 4 | `/docs/cli/cloud-workflow` | Cloud Workflow | Guide | Connecting to cloud: `debugbundle connect`, `debugbundle verify cloud`, incident retrieval with merged local+cloud view, `--source` filtering. |
| 5 | `/docs/cli/log-ingestion` | Log Ingestion | Guide | `debugbundle ingest` and `debugbundle watch` for log-based capture. `debugbundle-ndjson` format. First-party parsers (PHP error, Apache error). Custom format documentation. |
| 6 | `/docs/cli/tokens` | Token Management | Guide | `token project list/create/revoke`, `token member list/create/revoke`. When to use which token type. |
| 7 | `/docs/cli/webhooks` | Webhook Management | Guide | `webhook list/create/update/delete/test/deliveries/retry` commands with examples. |
| 8 | `/docs/cli/alerts` | Alert Management | Guide | `alert list/create/update/delete` with channel examples (email, Slack, Discord, webhook). |

### 1.4 API

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/api` | API Overview | Landing | Base URL, auth model (project tokens vs member tokens vs browser sessions), request/response format, pagination, error format, rate limiting. |
| 2 | `/docs/api/authentication` | Authentication | Guide | All three auth artifact types. How to create tokens. How to use headers. Cookie sessions for web app. Examples with curl. |
| 3 | `/docs/api/ingestion` | Event Ingestion | Guide | `POST /v1/events` deep dive: request format, event envelope schema, batch semantics, capture policy enforcement, rate limiting, error responses. |
| 4 | `/docs/api/incidents` | Incidents API | Guide | List, get, resolve incidents. Bundle and reproduction retrieval. Logs. Services. Query parameters, filtering, pagination. |
| 5 | `/docs/api/webhooks` | Webhooks API | Guide | CRUD operations, test delivery, delivery history, retry. Request/response examples for each endpoint. |
| 6 | `/docs/api/alerts` | Alerts API | Guide | CRUD operations with channel-specific payload examples. |
| 7 | `/docs/api/projects` | Projects API | Guide | List, create, update, delete projects. Token management endpoints. Capture policy endpoints. |
| 8 | `/docs/api/billing` | Billing API | Guide | Billing summary, capacity management, and owner-only endpoints. |
| 9 | `/docs/api/probes` | Probes API | Guide | Activate, deactivate, list remote probes. Trigger token issuance. SDK config endpoint. |

### 1.5 MCP

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/mcp` | MCP Overview | Landing | What MCP is, who it's for (AI agents in IDEs), how to configure the MCP server, auth model (reuses CLI auth state). |
| 2 | `/docs/mcp/tools` | MCP Tools | Reference | Complete tool inventory with parameters, return types, and example invocations. Organized by domain: incidents, bundles, webhooks, alerts, tokens, diagnostics. |
| 3 | `/docs/mcp/workflows` | MCP Agent Workflows | Guide | Practical agent workflow patterns: "investigate incident", "activate probe and share trigger link", "set up webhook pipeline", "run doctor checks". |

### 1.6 Webhooks & Alerts

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/webhooks` | Webhooks | Concept+Guide | Webhook system overview: event types, payload structure, signing/verification, retry behavior, auto-disable, delivery lifecycle. Setup walkthrough. |
| 2 | `/docs/webhooks/events` | Webhook Events | Reference | Every webhook event type with full payload examples: `bundle.created`, `bundle.updated`, `bundle.reopened`, `bundle.resolved`, `verification.passed`, `verification.failed`, `improvement_bundle.created`, `incident.spike_detected`. |
| 3 | `/docs/webhooks/verification` | Webhook Verification | Guide | How to verify HMAC-SHA256 signatures. Code examples in Node.js, Python, PHP, Go. |
| 4 | `/docs/alerts` | Alerts | Guide | Alert system overview: channels (email, Slack, Discord, webhook), conditions (new incident, regression, spike, severity threshold), configuration via CLI/API/MCP. |

### 1.7 Probes

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/probes` | Probes | Concept+Guide | Always-on diagnostic context. Ring buffer model. How probe data attaches to bundles. Remote activation (paid tiers). Trigger tokens for one-shot activation. Label hierarchy. Heavy probes. |

### 1.8 Bundles & Incidents

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/bundles` | Debug Bundles | Concept | What a bundle is, schema overview, bundle types (failure/improvement), versioning model, context blocks, determinism guarantee, regeneration thresholds. |
| 2 | `/docs/bundles/schema` | Bundle Schema | Reference | Full JSON schema with field descriptions. Link to `examples/bundle.failure.json` and `examples/bundle.improvement.json`. |
| 3 | `/docs/incidents` | Incident Lifecycle | Concept | Fingerprinting, grouping, incident states (open/resolved/regressed), spike detection, regression detection, occurrence sampling, frequency counters. |
| 4 | `/docs/incidents/reproduction` | Reproduction Artifacts | Concept | What reproduction artifacts are, confidence levels, curl/HTTPie/JSON spec outputs, when reproduction is possible vs not. |

### 1.9 Configuration & Project Setup

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/project-setup` | Project Setup | Guide | End-to-end project setup: `debugbundle setup`, profile.json, `.debugbundle/` structure, `.gitignore` entries, agent skill generation, `AGENTS.md` integration. |
| 2 | `/docs/project-setup/profile` | Project Profile | Reference | `profile.json` schema, static detection, agent enrichment, validation, staleness warnings. |
| 3 | `/docs/project-setup/local-only` | Local-Only Mode | Guide | Complete local-only workflow without a cloud account. File transport, `debugbundle process`, local incident management. |
| 4 | `/docs/project-setup/connect-to-cloud` | Connect to Cloud | Guide | Upgrading from local-only to connected: `debugbundle connect`, environment delivery policy, member token setup. |
| 5 | `/docs/capture-policy` | Capture Policy | Concept+Guide | Event classes (A/B/C), capture presets (minimal/balanced/investigative), per-project overrides, how policies affect billing, SDK-side enforcement. |

### 1.10 Self-Hosting

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/self-hosting` | Self-Hosting Guide | Guide | Docker Compose setup from `deploy/selfhost/`. Environment variables. Infrastructure requirements (Postgres, Redis, S3-compatible storage). Health checks. Backup strategy. Upgrade path. |

### 1.11 Security & Privacy

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/security` | Security | Concept | Redaction pipeline, token security (hashing, scoping), webhook signing, data retention, capture policy as privacy control, no fine-grained hardware identifiers. |
| 2 | `/docs/security/redaction` | Redaction | Guide | Default redaction rules, custom redaction patterns, where redaction happens (SDK → ingestion → storage), redaction markers in bundles. |
| 3 | `/docs/security/tokens` | Token Security | Guide | Project tokens vs member tokens vs browser sessions. Scope separation. Hashing at rest. Plaintext-once model. Revocation. |

### 1.12 Agent Integration

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/agent-workflows` | Agent Workflows | Concept+Guide | The agent-first thesis. How agents use DebugBundle: webhook pipelines (webhook → fetch bundle → analyze → open PR), probe activation for live debugging, MCP tool usage patterns, agent skill file explained. |
| 2 | `/docs/agent-workflows/skill-file` | Agent Skill File | Reference | `.agents/skills/debugbundle/SKILL.md` structure, agentskills.io spec, how agents discover and use the skill, progressive disclosure sections, references/assets/evals. |
| 3 | `/docs/agent-workflows/automation-recipes` | Automation Recipes | Guide | Concrete end-to-end recipes: "Auto-investigate on webhook", "Activate probe with trigger token for end-user", "Agent-driven setup from scratch", "PR-on-failure pipeline". |

### 1.13 Pricing & Billing

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/pricing` | Pricing | Reference | Free / Solo / Team comparison table. What each tier includes. Capacity-unit add-ons. Event billing model. When to upgrade. Self-host as unlimited alternative. |
| 2 | `/docs/billing` | Billing | Guide | How billing works: Stripe integration, shared allowances, usage metering, over-limit behavior, capacity management, billing lifecycle emails. |

### 1.14 Reference (Generated)

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/v1/reference` | Reference Index | Landing | Links to all generated reference pages. |
| 2 | `/docs/v1/reference/api-endpoints` | API Endpoints | Generated | OpenAPI-derived endpoint reference. |
| 3 | `/docs/v1/reference/cli-commands` | CLI Commands | Generated | CLI command definitions with all flags and examples. |
| 4 | `/docs/v1/reference/mcp-tools` | MCP Tools | Generated | MCP tool definitions with parameter schemas. |
| 5 | `/docs/v1/reference/webhook-events` | Webhook Events | Generated | Webhook event schemas with example payloads. |
| 6 | `/docs/v1/reference/bundle-schema` | Bundle Schema | Generated | Full bundle JSON schema. |
| 7 | `/docs/v1/reference/profile-schema` | Profile Schema | Generated | `profile.json` JSON schema. |
| 8 | `/docs/v1/reference/error-codes` | Error Codes | Generated | All API error codes with descriptions and resolution guidance. |

### 1.15 Supplementary

| # | Path | Title | Type | Purpose |
|---|------|-------|------|---------|
| 1 | `/docs/troubleshooting` | Troubleshooting | Guide | Common issues and fixes: SDK not capturing, events not appearing, bundle pending, webhook failures, auth errors, self-host problems. |
| 2 | `/docs/faq` | FAQ | Reference | Frequently asked questions covering product positioning, pricing, security, data handling, SDK compatibility, self-hosting. |
| 3 | `/docs/changelog` | Changelog | Reference | Version history for the product, SDKs, and API. The canonical product release number comes from the root `debugbundle` repository release (`v*`), while package- and SDK-specific releases link to their own release notes. |
| 4 | `/docs/llms-txt` | llms.txt | Concept | What `llms.txt` is and how AI agents can discover DebugBundle capabilities via `/llms.txt`. |

---

## 2. Navigation Structure (Fumadocs `meta.json`)

Fumadocs uses `meta.json` files in content directories to control sidebar ordering and grouping. The navigation must match the page tree above.

### Root `content/docs/meta.json`

```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "---Getting Started---",
    "what-is-debugbundle",
    "quickstart",
    "how-it-works",
    "installation",
    "core-concepts",
    "---SDKs---",
    "sdks/...",
    "---CLI---",
    "cli/...",
    "---API---",
    "api/...",
    "---MCP---",
    "mcp/...",
    "---Webhooks & Alerts---",
    "webhooks/...",
    "alerts",
    "---Probes---",
    "probes",
    "---Bundles & Incidents---",
    "bundles/...",
    "incidents/...",
    "---Configuration---",
    "project-setup/...",
    "capture-policy",
    "---Self-Hosting---",
    "self-hosting",
    "---Security---",
    "security/...",
    "---Agent Integration---",
    "agent-workflows/...",
    "---Pricing---",
    "pricing",
    "billing",
    "---Reference---",
    "v1/reference/...",
    "---More---",
    "troubleshooting",
    "faq",
    "changelog",
    "llms-txt"
  ]
}
```

Sub-directories (`sdks/`, `cli/`, `api/`, etc.) each get their own `meta.json` to control ordering within the section.

---

## 3. Content Standards

### 3.1 Page Anatomy

Every documentation page must follow this structure:

```mdx
---
title: Page Title
description: One-sentence SEO description
---

## Overview / Introduction

1-3 paragraphs establishing what this page covers and who it's for.

## [Core content sections]

Organized by task or concept. Use H2 for major sections, H3 for subsections.

## Next Steps

Links to the logical next pages in the reading flow.
```

### 3.2 Code Examples

- Every code example must specify the language for syntax highlighting
- Include the full import/require statements
- For SDK examples, show the complete initialization + usage pattern
- For CLI examples, show the command and its output
- For API examples, show the full curl command and the JSON response
- Use tabs (Fumadocs `<Tabs>` component) for multi-language/multi-framework examples
- Never use `...` in runnable code blocks — show the complete code

### 3.3 Configuration Tables

SDK config options, CLI flags, API parameters, and environment variables must be documented in tables:

```
| Field | Type | Default | Description |
|-------|------|---------|-------------|
```

### 3.4 Callouts

Use Fumadocs callout components for:
- **Note** — additional context that's helpful but not critical
- **Warning** — important caveats or gotchas
- **Danger** — destructive actions or security implications
- **Tip** — helpful shortcuts or best practices

### 3.5 Cross-Linking

- Every page must link to related pages (sidebar is not enough)
- CLI pages link to corresponding API pages and vice versa
- SDK pages link to the universal interface reference
- Concept pages link to the relevant guide pages
- Guide pages link to the relevant reference pages

### 3.6 Versioning

- All docs live under `/docs` with version-specific content under `/docs/v1/reference/`
- Guides and concepts are not versioned in V1 (only one active version)
- When V2 ships, guides fork into `/docs/v2/` and V1 gets a deprecation banner

---

## 4. Per-Page Content Requirements

### 4.1 Quickstart (`/docs/quickstart`)

This is the single most important docs page. It must:

1. **Two paths, clearly labeled:**
   - **Path A: Agent-Driven** — A ready-made prompt the user copies into their AI agent (Copilot, Cursor, Claude, etc.) that executes `debugbundle setup`
   - **Path B: Manual** — Step-by-step CLI commands

2. **Steps (both paths resolve to the same outcome):**
   - Install the CLI (`npm i -g @debugbundle/cli`)
   - Run setup (`debugbundle setup`)
   - Add SDK initialization to the app (show Express example)
   - Trigger a test error
   - Inspect the captured incident (`debugbundle inspect <id>`)
   - View the debug bundle

3. **End state:** "Congratulations — you just captured your first incident and generated a debug bundle."

4. **Time estimate:** Explicitly say "~3 minutes"

5. **Next steps:** Links to SDK docs, CLI setup, connect to cloud

### 4.2 SDK Pages (`/docs/sdks/node`, `/docs/sdks/browser`, etc.)

Each SDK page must contain, in order:

1. **Install** — Package manager command
2. **Initialize** — Minimal `init()` call with required config
3. **Configuration** — Full config options table with types, defaults, descriptions
4. **Vanilla Hooks** — Language-native error/exception/logging hooks
5. **Framework Integrations** — Per-framework setup (tabbed)
6. **Logger Integrations** — Per-logger setup (tabbed)
7. **Capture Methods** — `captureException`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `probe`, `flush` with examples
8. **Transport** — How events are shipped (file vs HTTP vs relay), environment-based selection
9. **Redaction** — Default rules and custom patterns
10. **Sampling** — `sampleRate`, and for browser: `sessionSampleRate`, `maxEventsPerSession`
11. **Volume Control** — Duplicate suppression, loop protection, backoff
12. **Probes** — `probe()` method, ring buffer config, always-on vs remote activation
13. **Troubleshooting** — Common issues specific to this SDK

For SDKs not yet shipped (Python, PHP), the page must:
- State "Coming Soon" clearly at the top
- Show the planned interface contract (from `/contracts/sdk-interface.md`)
- Show the expected framework integrations
- Link to the GitHub issue or roadmap item

### 4.3 Webhooks Page (`/docs/webhooks`)

Must contain:

1. **Overview** — What webhooks are for, delivery guarantees
2. **Setup** — Creating a webhook via CLI, API, or web app (tabbed)
3. **Event Types** — Table of all 8 event types with trigger conditions
4. **Payload Structure** — Common envelope fields, then per-event-type payload examples
5. **Signing & Verification** — HMAC-SHA256 explanation with code examples in 4 languages
6. **Retry Behavior** — 5-retry schedule, exponential backoff, auto-disable after 50 failures
7. **Delivery Lifecycle** — State diagram (pending → delivered | retrying → failed/disabled)
8. **Testing** — How to send test deliveries
9. **Filtering** — Event type, bundle type, severity, service, environment filters

### 4.4 API Authentication (`/docs/api/authentication`)

Must contain:

1. **Three Auth Types** — Table comparing project tokens, member tokens, browser sessions
2. **When to Use Which** — Decision matrix
3. **Creating Tokens** — Via web app, CLI, and API
4. **Using Tokens** — Header format (`Authorization: Bearer dbundle_member_...` / `X-Project-Token: dbundle_project_...`)
5. **Token Scope** — What each token type can access
6. **Token Security** — Hashing at rest, plaintext-once, revocation

### 4.5 Self-Hosting (`/docs/self-hosting`)

Must contain:

1. **Prerequisites** — Docker, Docker Compose, hardware requirements
2. **Quick Start** — `docker compose up` from `deploy/selfhost/`
3. **Configuration** — All environment variables in a table
4. **Infrastructure** — Postgres, Redis, S3-compatible storage requirements
5. **Health Checks** — `/health`, `/ready`, `/live` endpoints
6. **Upgrades** — How to update to new versions
7. **Backup** — Database and S3 backup guidance
8. **Limitations** — What's different from hosted (no Stripe billing, no team features unless self-configured)

### 4.6 Troubleshooting (`/docs/troubleshooting`)

Organized as a problem → solution list:

1. **SDK not capturing events** — checklist (init called? token valid? environment correct? enabled: true?)
2. **Events not appearing in cloud** — transport check, network, rate limits
3. **Bundle shows "pending"** — worker lag, processing queue
4. **Webhook not delivering** — endpoint reachable? signing verification? auto-disabled?
5. **CLI "not authenticated"** — token expired? `debugbundle login` needed?
6. **Self-host startup failures** — Docker health checks, S3 bucket bootstrap, migration status
7. **Probe data not appearing** — ring buffer config, label limits, tier restrictions

---

## 5. Fumadocs Features to Implement

### 5.1 Search

Fumadocs provides built-in search (Orama-based static search by default). Must be enabled:
- Full-text search across all docs and blog content
- Keyboard shortcut (Cmd+K / Ctrl+K)
- Search results show page title, section heading, and preview text

### 5.2 Table of Contents

Every page must render an "On this page" sidebar (Fumadocs `toc` prop on `DocsPage`). Already wired — content must use proper heading hierarchy (H2 → H3 → H4) for accurate ToC generation.

### 5.3 Page Navigation

Fumadocs provides prev/next page navigation at the bottom of each page. Navigation order is determined by `meta.json` file ordering.

### 5.4 Code Blocks

Use Fumadocs enhanced code blocks:
- Syntax highlighting (Shiki)
- Copy button
- File name tabs
- Line highlighting
- Diff view for before/after examples

### 5.5 Tabs Component

For multi-framework/multi-language examples:
```mdx
<Tabs items={["Express", "Fastify", "Next.js"]}>
<Tab value="Express">
```express
// Express code
```
</Tab>
</Tabs>
```

### 5.6 Steps Component

For sequential setup instructions:
```mdx
<Steps>
### Install the SDK
npm install @debugbundle/sdk-node

### Initialize
Add to your app entry point...

### Verify
Run `debugbundle verify local`
</Steps>
```

### 5.7 Cards Component

For section landing pages, use card grids linking to sub-pages.

### 5.8 API Playground (Post-V1)

Fumadocs supports OpenAPI-driven API playground. Deferred to post-V1 but the OpenAPI spec (`openapi.json`) is already generated at build time.

---

## 6. Machine-Readable Artifacts

These files are published alongside docs as part of the static build:

| Artifact | Path | Source |
|----------|------|--------|
| OpenAPI Spec | `/openapi.json` | Generated from `apps/api/src/openapi.ts` |
| Bundle Schema | `/schemas/bundle-v1.json` | Extracted from `packages/shared-types` |
| Profile Schema | `/schemas/profile-v1.json` | Extracted from `packages/shared-types` |
| Webhook Payload Schema | `/schemas/webhook-payload-v1.json` | Extracted from `packages/shared-types` |
| Example Failure Bundle | `/examples/bundle.failure.json` | `examples/bundle.failure.json` |
| Example Improvement Bundle | `/examples/bundle.improvement.json` | `examples/bundle.improvement.json` |
| `llms.txt` | `/llms.txt` | Static file describing DebugBundle for LLM discovery |

---

## 7. Content Priority Order

Implementation should proceed in this order (most impactful first):

### P0 — Must Ship Before Public Launch

1. `/docs` (landing)
2. `/docs/what-is-debugbundle`
3. `/docs/quickstart`
4. `/docs/how-it-works`
5. `/docs/installation`
6. `/docs/core-concepts`
7. `/docs/sdks` (overview)
8. `/docs/sdks/node`
9. `/docs/sdks/browser`
10. `/docs/cli` (overview)
11. `/docs/cli/setup`
12. `/docs/cli/local-workflow`
13. `/docs/api` (overview)
14. `/docs/api/authentication`
15. `/docs/api/incidents`
16. `/docs/webhooks`
17. `/docs/security`
18. `/docs/troubleshooting`
19. `/docs/faq`

### P1 — Must Ship Within 2 Weeks of Launch

20. `/docs/sdks/python` (coming soon page)
21. `/docs/sdks/php` (coming soon page)
22. `/docs/sdks/universal-interface`
23. `/docs/sdks/browser-relay`
24. `/docs/cli/cloud-workflow`
25. `/docs/cli/log-ingestion`
26. `/docs/cli/tokens`
27. `/docs/cli/webhooks`
28. `/docs/cli/alerts`
29. `/docs/api/ingestion`
30. `/docs/api/webhooks`
31. `/docs/api/alerts`
32. `/docs/api/projects`
33. `/docs/api/probes`
34. `/docs/mcp` (overview)
35. `/docs/mcp/tools`
36. `/docs/mcp/workflows`
37. `/docs/webhooks/events`
38. `/docs/webhooks/verification`
39. `/docs/alerts`
40. `/docs/probes`
41. `/docs/bundles`
42. `/docs/bundles/schema`
43. `/docs/incidents`
44. `/docs/incidents/reproduction`

### P2 — Ship Within 1 Month

45. `/docs/project-setup`
46. `/docs/project-setup/profile`
47. `/docs/project-setup/local-only`
48. `/docs/project-setup/connect-to-cloud`
49. `/docs/capture-policy`
50. `/docs/self-hosting`
51. `/docs/security/redaction`
52. `/docs/security/tokens`
53. `/docs/agent-workflows`
54. `/docs/agent-workflows/skill-file`
55. `/docs/agent-workflows/automation-recipes`
56. `/docs/pricing`
57. `/docs/billing`
58. `/docs/api/billing`
59. `/docs/changelog`
60. `/docs/llms-txt`

---

## 8. Acceptance Criteria

### AC-DOC-01: Quickstart Completeness
- **Given** a new developer reading `/docs/quickstart`
- **When** they follow either the agent-driven or manual path
- **Then** they successfully capture their first incident and view a debug bundle
- **And** zero external documentation is needed to complete the flow

### AC-DOC-02: SDK Documentation Completeness
- **Given** any shipped SDK (Node.js, Browser)
- **Then** the SDK docs page contains: install, init, config table, vanilla hooks, framework integrations, logger integrations (backend only), capture methods, transport, redaction, sampling, volume control, probes, troubleshooting
- **And** every code example is copy-paste runnable

### AC-DOC-03: Navigation Completeness
- **Given** the Fumadocs sidebar
- **Then** every page listed in Section 1 appears in the sidebar at the correct position
- **And** section separators group pages logically
- **And** prev/next navigation flows in the documented order

### AC-DOC-04: Search Functionality
- **Given** a user pressing Cmd+K on any docs page
- **Then** a search dialog appears
- **And** searching for "webhook" returns all webhook-related pages
- **And** searching for "captureException" returns the relevant SDK pages

### AC-DOC-05: Cross-Reference Integrity
- **Given** any docs page
- **Then** all internal links resolve to existing pages
- **And** no broken links exist in the docs tree

### AC-DOC-06: Machine-Readable Artifacts
- **Given** the built static site
- **Then** `/openapi.json`, `/schemas/bundle-v1.json`, `/llms.txt`, and example bundles are accessible
- **And** schemas validate against their definitions

### AC-DOC-07: Two-Path Installation
- **Given** the quickstart and every SDK installation page
- **Then** both agent-driven and manual installation paths are documented
- **And** the agent-driven path includes a copy-paste-ready prompt

### AC-DOC-08: Coming Soon SDKs
- **Given** an unshipped SDK (Python, PHP)
- **Then** the page clearly indicates "Coming Soon"
- **And** shows the expected interface contract
- **And** lists planned framework integrations

### AC-DOC-09: ToC Accuracy
- **Given** any docs page with 3+ H2 sections
- **Then** the "On this page" sidebar accurately reflects all H2 and H3 headings

### AC-DOC-10: Code Example Correctness
- **Given** any code example in the docs
- **Then** imports are complete, syntax is valid, and the example aligns with the current SDK/API/CLI interface

---

## 9. Anti-Patterns (Do NOT Do These)

1. **Do not write "see the dashboard for..."** — DebugBundle is CLI/API/MCP-first. Every capability must be documented for non-dashboard interfaces.
2. **Do not use placeholder screenshots** — If a screenshot is needed, it must be real. Prefer code examples over screenshots.
3. **Do not document features that don't exist** — Each page documents what is shipped. Coming-soon features get explicit "Coming Soon" labels.
4. **Do not duplicate reference content in guides** — Guides link to reference pages. Reference pages are the single source of truth for schemas, parameters, and payloads.
5. **Do not write marketing copy in docs** — Docs are factual, direct, and task-oriented. Marketing belongs on the landing page and `/pricing`.
6. **Do not create docs pages without `meta.json` entries** — Every page must be navigable from the sidebar.
7. **Do not use framework-specific jargon without context** — Explain MCP, explain what a "member token" is, explain "fingerprinting" on first use.

---

## 10. Benchmark Standards

The documentation quality bar is set by these reference implementations:

| Tool | What to learn from it |
|------|----------------------|
| **Stripe Docs** | Progressive disclosure, copy-paste code, tabbed multi-language examples, clear auth docs |
| **Sentry Docs** | SDK per-platform structure, getting started flow, configuration tables |
| **Vercel Docs** | Clean Fumadocs-style layout (they use a similar framework), clear navigation, concept + guide separation |
| **Supabase Docs** | Self-hosting guide quality, API reference depth, quickstart clarity |
| **Linear Docs** | Concise product explanation, keyboard-shortcut-driven UX, clean information hierarchy |

The aspirational standard: **a developer should never need to leave the docs to use any DebugBundle feature.**
