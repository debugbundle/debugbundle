# Alert scope release — 5 November 2026

Status: owner authorised the production release train, commits/pushes and return
to main with unused branches cleared. Release in progress; no deployment claim yet.

## Scope and identities

Core 1.22.0, CLI/MCP/OpenClaw/portable skill 1.20.0, shared-types 3.2.0 and site
1.7.3 deliver the audited alert-scope read, dashboard correction and approved
agent-credential button alignment. Redaction 2.7.0 is unchanged and must retain
its published integrity. No schema, alert policy, credential or SDK change.

Codex 1.5.1, Claude Code 1.19.4 and Gemini 1.4.4 retain their published MCP 1.19.4
pins after review: this additive read does not require a developer-package update;
existing calls stay compatible. Hosted OpenAI and consumer products are excluded.

## Release gates

- Baseline audit: 5,250 cases/653 files/112 chunks, including 110 PostgreSQL cases;
  final 790 dashboard cases and all 24 changed-source coverage checks pass.
- Validate bumped manifests, shared artifact integrity and native OpenClaw on the
  supported minimum and current public host 2026.11.1. Exact-source CI and package
  workflows gate publication. Publish fresh immutable versions only.
- Publish MCP ecosystem from the verified npm artifact; exclude retired Smithery
  publishers. Keep exact ClawHub security and discovery outcomes explicit. The
  prior 1.19.4 missing-antivirus issue does not become a passing new release.
- Merge qualified source to main, publish canonical releases, deploy exact core
  and site commits through cloud workflows with existing merge/MCP gates preserved.
- Verify runtime versions/digests, migrations/readiness, queues/health/alarms,
  served dashboard/docs and authenticated scope/default/legacy reads. No synthetic
  incident or notification delivery is required for this read-only correction.
- Reconcile docs and release evidence; archive parked Analytics/Muse commits before
  deleting unused branch references. Do not discard worktree changes.

Raw receipts: `.tmp/alert-scope-release-20261105/`.
