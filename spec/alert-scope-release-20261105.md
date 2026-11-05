# Alert scope release — 5 November 2026

Status: production delivery and repository cleanup verified. Exact ClawHub
antivirus acceptance remains open; the complete marketplace train is not green.

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

## Published source and qualification

PR [#13](https://github.com/debugbundle/debugbundle/pull/13) merged as
`795f3f1e81e6fb7ec98731c25ce748a49b2edc29`, with a tree identical to qualified
`be1f4fb4`. Both [source CI](https://github.com/debugbundle/debugbundle/actions/runs/42045582971)
and [merged-main CI](https://github.com/debugbundle/debugbundle/actions/runs/42051210549)
pass: 5,235 cases/112 chunks, including 110 actual PostgreSQL cases, with 15
expected private-site skips covered by local/site qualification. Coverage is
87.83% lines / 90.15% functions / 78.73% branches / 86.87% statements; all 24
changed-source gates pass. The local full audit qualifies 5,250 cases and all
790 dashboard cases. CLI runtime CI 42045583018 and 42051210428 pass.

| Surface | Version | Passing publication workflow |
| --- | --- | --- |
| Core | 1.22.0 | [42051537606](https://github.com/debugbundle/debugbundle/actions/runs/42051537606) |
| CLI | 1.20.0 | [42049997955](https://github.com/debugbundle/debugbundle/actions/runs/42049997955) |
| MCP | 1.20.0 | [42049998980](https://github.com/debugbundle/debugbundle/actions/runs/42049998980) |
| Shared types | 3.2.0 | [42049998383](https://github.com/debugbundle/debugbundle/actions/runs/42049998383) |
| Site | 1.7.3 | [42051984571](https://github.com/debugbundle/site/actions/runs/42051984571) |

Shared publication retains redaction 2.7.0 with exact integrity. A local archive
comparison found 64 ignored compiled Analytics files with no current source.
Every clean CI-published file matched; only the validated stale outputs were
removed. The repeated shared integrity check now retains both published packages
exactly. The published artifacts were unaffected by this local residue.

Native Codex candidate/published gates and OpenClaw runtime checks pass on Node
22/24/26. The current OpenClaw 2026.11.1 host installs exact public plugin 1.20.0
normally, loads all 149 tools and passes installed native scoped requests. Remote
checks use normal provider enforcement without a force override. All six public
plugin files and the portable skill body match qualified source bytes.

## Production verification

[Hosted rollout 42053499273](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42053499273)
passes from cloud `cb11cfb0`, exact core `795f3f1e` and site
`00749bc0160cef6836fff97da295510ea98070c1`. Runtime promotion completed at
15:23:56 UTC. API/worker report core 1.22.0 with immutable image digest
`sha256:7bccabafbb91ff7c52169a50edb8af440606fabda2471d9fa0aac8d46c7670aa`.
The previous stable digest `sha256:6fb7afe9e94d894fe0e3e97d19fc6119ca89243a65646d32050f0f27d3b2918c`
and its release remain locally available. Both containers are healthy with zero
restarts/OOM; readiness is 200, queues contain no pending work, and about 44.7 GiB
is free. The new pre-release database snapshot is available.

Read-only fingerprints preserve five alert rules, nine token/credential scopes,
five service identities and all 66 migration records. The published CLI returns
five correctly scoped rules, with one retained App and two retained Site rules.
All canonical rules keep their original partial origins; retained views keep
their original complete coverage. Default rows exactly match the pre-release
response, including through the unchanged installed CLI 1.19.1. No alert policy,
SDK, credential, consumer product or production canary was changed.

Seven served app/docs resources match S3 origin bytes and cache policy, including
the new scope/credential-action code and updated guides. All three saved endpoint
checks ran at 15:30:54 UTC after cutover and pass; all eight alarms are OK. No new
active incident was observed in the bounded canonical-project comparison.

## Marketplace acceptance and cleanup

The official Registry serves exact MCP 1.20.0. Its short-lived JWT expired during
preflight; renewing immediately before the Registry-only publish succeeded.
ClawHub publishing then ran its mandatory preflight independently. Both 1.20.0
uploads were accepted once and are public, with clean final reviews and matching
source. Required antivirus results remain absent for both, so the strict verifier
fails closed. Publication and successful normal installation do not close that gate.
Complete scanner findings/dispositions remain in
`.tmp/mcp-ecosystem/1.20.0/report.json`; retired Smithery, broad discovery and
manual directory checks retain their separately reported limits.

Core/site/cloud are on main. The merged fix branch was removed locally/remotely.
Before clearing the unused Muse/Analytics branches and detached worktree, a
verified complete Git bundle, protected 28-file local archive and local annotated
archive tags preserved the parked commits, including the unpublished Analytics
commit. Recovery records are in `.local-repos/branch-archives/manifest-20261105.json`.
No parked work or consumer product was published. Documentation/evidence follow-ups
do not change the qualified runtime code or require another deployment.
