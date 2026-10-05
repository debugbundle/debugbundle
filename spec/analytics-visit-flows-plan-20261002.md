# Focused acquisition and activation flows — revised 2026-10-04

The active design and acceptance contract is [Public acquisition and activation flows](analytics-public-flows-20261003.md), FR-ANL-30 / AC-ANL-21.

The owner clarified that this is a public customer feature. DebugBundle is one consumer, not the data model.
The earlier local operator-only reports, global site/app pair, signup consent fields, account/incident joins,
arrival cookies and bundle-receipt hooks are replaced directly. They were never released and require no
compatibility layer or upgrade migration. Preserve actual published behavior and production schemas.

## Scope

- Project-owned named acquisition/activation definitions with 2–8 ordered steps and exact origins.
- Site→blog, site→dedicated auth→successful login→app, and explicit customer steps.
- Headless Browser SDK and public HTTP capture with short-lived, hashed, origin-bound continuity.
- Aggregate current/previous full-UTC-day reports through UI, API, CLI and ordinary MCP.
- Permission checks, disabled/consent gates, retry/order/expiry/replay protection, bounded retention,
  project deletion, additive production migration and populated-upgrade checks.
- General public documentation; no public consent UI or marketing changes.

The expanded `update/analytics` checklist stays parked. Revenue/cohort platforms, global identity, arbitrary
journey warehouses, all-backend-SDK helpers and million-visit load testing remain outside this slice.

## Verification and release

See STATUS.md for current local evidence and outstanding checks. Earlier internal-candidate test counts
are superseded. Use Docker-backed Make targets and disposable services, with no browser/screenshots.
SDK publication/adoption, CLI/MCP/OpenClaw release coordination, clean-tree release checks and production
configuration/deployment require separate action-specific approval. No such action is authorized here.
