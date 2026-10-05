# Current handoff — analytics release complete, 2026-10-05

[Release evidence](spec/analytics-public-flows-release-20261005.md) records exact sources, packages, workflows, deployed images, live checks and remaining external discovery limitations. [The local audit](spec/analytics-public-flows-audit-20261004.md) retains the preceding implementation proof.

## Scope and owner decisions

- Public, project-defined acquisition and activation flows support site→site, site→dedicated auth→app, and explicit custom steps. DebugBundle consumes the same public APIs as customers.
- The expanded `update/analytics` branch/checklist remains parked. No compatibility path was added for the discarded unreleased private implementation; existing published interfaces/data remain compatible.
- Public consent UI was removed. Programmatic capture policy and the existing internal analytics off switch remain, with stored opt-out precedence. The owner approved the own-site/app integration and release article.
- Use Docker-backed Make targets; no browser/screenshots. Million-visit load testing remains explicitly deferred.
- The owner approved commits, pushes, tags, publication and deployment for this release. The owner separately approved extending the existing OpenAI reviewer credential by exactly 30 days to unblock startup; its hash is unchanged.

## Shipped implementation

- Versioned project definitions with 2–8 steps, exact origins and archive; authorized member reports/management and write-only project-token capture.
- Hashed expiring contexts, single-use origin-bound handoffs, ordered idempotent steps, explicit unlinked observations, daily aggregate reports and bounded retention.
- Browser SDK 3.1.0 `createAnalyticsFlowClient`: headless controls, tab-scoped sessionStorage continuity, same-tab OAuth return, fragment cleanup, bounded transport, nonthrowing behavior and withdrawal. Generic HTTP capture is also supported; backend SDK flow helpers are outside scope.
- Analytics Flows UI, API, CLI, developer MCP and OpenClaw use the same domain service. The independently versioned hosted OpenAI catalog is unchanged.
- Additive forward migration `202610030001_add_public_analytics_flows`, readiness-required tables, migration ledger/checksum validation, and project deletion cascades.
- Generic public guides and the published article describe customer use. Own-site acquisition and app activation definitions are configured through the public API.

## Release and verification

- Core 1.14.0, Browser/Node SDKs 3.1.0, shared-types/redaction 2.2.0, CLI/MCP/OpenClaw 1.13.0, Codex 1.1.2, Claude Code 1.13.0, Gemini extension 1.0.1 and site 1.6.0 are published.
- Released core source `15f80d2fceb4c4d87478f69a89aee590b1382b86`; site `9ba5d0935ed61fcc6b59718c5d61133a8fd150ba`. Full source CI: 3,777 tests, lint/types/builds and changed-source coverage pass. SDK: 517 tests plus installed-package safety checks. Site tests/types/audit and GitHub build pass. Native public agent installation checks pass.
- First hosted attempt `37290780026` stopped safely before promotion because the existing reviewer credential was below the seven-day startup window. The additive migration was applied; prior production remained healthy. After the separately approved expiry extension, retry `37293228676` succeeded.
- API/worker run core 1.14.0 at immutable digest `sha256:3f0d07996cc88e628f87aa882f31bae7a4597cc5e1b0f0616b6c79bf4f256025`, healthy with zero restarts. Migration and all four tables are verified. Exactly the active and one verified previous release are retained; 45 GiB disk is free.
- API/MCP readiness passes, the app reports the exact released SHA, and compiled site/app assets contain the correct public flow integration. The article's live canonical, title, four agents, structured data and sitemap are verified.
- Published Browser SDK live canary passed handoff, wrong-origin rejection, URL cleanup, ordered completion, retry, report boundary and withdrawal. Its disposable project was deleted. Published CLI/MCP returned the same live flow report.
- Existing API health check passes. No new incident appeared; the eight existing reviewer-expiry incidents were resolved only after verifying the corrected expiry in the running API. The scoped active queue is empty.

## Repository state and remaining limits

All 17 repositories are on `main`. Local `update/visit-flows` branches and the three published remote feature branches were deleted only after ancestry verification. Documentation/provenance commits after release do not change the deployed source SHA.

Registry, Smithery and ClawHub/OpenClaw publication are verified. Two ClawHub searches remain below their ranking target; Glama verification returned 401, while PulseMCP/LobeHub need manual verification. These directory limitations do not block the verified runtime or public Git/npm installation paths. No OpenAI portal submission occurred. Reviewer access expires on 2026-11-07; any further extension or review-lifecycle change requires the appropriate owner approval.
