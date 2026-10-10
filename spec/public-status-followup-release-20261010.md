# Public status controls patch release — 2026-10-10

Core 1.16.1 releases the owner-accepted FR-AVC-07 / AC-AVC-07 modal follow-up.
The owner explicitly authorized commit, push and release on 2026-10-10.

## Scope and review

The shared settings dialog saves visibility through the existing owner-authorized
PUT. First enable validates and publishes the initial form; existing-page toggles
use saved settings while preserving other drafts. The copy field appears during
publication, empty copying is disabled, and failure restores saved visibility.
Preview status page initially focuses its heading and retains deliberate keyboard
day details and focus return. Competing actions are disabled while saving; late
responses after closing are ignored. Collaborator access remains read-only.

No API, domain, schema, runtime configuration or dependencies change. Independent
CLI/MCP/shared/SDK/plugin versions remain unchanged; site 1.6.4 aligns its guide
and generated core-version reference with this patch. The existing 58-migration ledger and additive public-status
migration remain required. Public projection/privacy, CSRF and ownership checks
are unchanged. No customer publication or monitoring state is changed to verify
the release. The launch review found outdated README/website toggle and preview
instructions; both were corrected before deployment.

## Qualification

Before release preparation, all 78 focused and adjacent tests in 11 files, both
changed-source coverage gates, focused lint, repository typecheck and candidate
builds passed. Tests cover first-enable validation, saved/draft separation,
existing empty configurations, pending/failure/retry states, late responses,
preview focus, clipboard fallback and collaborator restrictions.

Fresh launch qualification passed 78 tests in 11 files and both changed-source
coverage gates, repository typecheck, candidate builds and high-severity audit
(no high/critical findings). Full repository lint, all 4,178 local unit/contract tests in 511 files / 93 shards
and exact-source CI/release checks passed before deployment. Logs are retained in ignored
`.tmp/public-status-patch-{coverage,typecheck,build,audit,lint}.log`.

Read-only production baseline: core 1.16.0 source
`f658a487f58807c1eaab2bdcd6cd2dfcb45cd338`, both containers healthy with zero
restarts/OOMs, worker processing enabled, migration ledger 58 with unchanged
public-status checksum. API health passes with zero consecutive failures;
local active incidents are empty, and the scoped cloud incident remains at three
occurrences with last activity on October 6. Managed PostgreSQL is private and
available with backups enabled (latest restorable 17:41:22 UTC); disk has 45 GiB
free and memory headroom passes the normal rollout floor.

The initial unchanged-site plan was superseded by the guide correction. The
qualified site 1.6.4 source is `542ba5a13b432c88b6600f76ff0a6aa48c298d6b`.

## Publication and deployment

- Implementation commit `ddb60edc` and README correction `7e8d493f` are committed
  and pushed. Core tag `v1.16.1` and deployed source both resolve to
  `f73f1d8ac8192db354f30cf9badb5ba2fd66d5f6`; intervening commits refresh provenance.
- Implementation CI [38073149152](https://github.com/debugbundle/debugbundle/actions/runs/38073149152)
  passes 4,164 public tests and both changed-source gates. The 14 private-site
  cases skipped in public CI pass locally. Final source CI
  [38074141707](https://github.com/debugbundle/debugbundle/actions/runs/38074141707)
  and five-runtime CLI compatibility [38074141718](https://github.com/debugbundle/debugbundle/actions/runs/38074141718)
  pass; all three native Gemini jobs pass. Settings coverage is 98.67% lines,
  97.01% functions and 88.77% branches; copy input coverage is 100%.
- Core [release 38074697868](https://github.com/debugbundle/debugbundle/actions/runs/38074697868)
  passes additional API/worker/interface gates and publishes [v1.16.1](https://github.com/debugbundle/debugbundle/releases/tag/v1.16.1).
  Site CI [38074321974](https://github.com/debugbundle/site/actions/runs/38074321974)
  and [release 38074561011](https://github.com/debugbundle/site/actions/runs/38074561011)
  pass, publishing site v1.6.4 at the exact site commit. All 41 local site tests,
  static export and typecheck pass. Audit has no high/critical findings.
- Hosted [run 38075660361](https://github.com/debugbundle/debugbundle-cloud/actions/runs/38075660361)
  succeeds from trusted cloud `b5693be75a31e791c25a8a9cb16a1a96bc7951c8`, pinned
  product/site sources above, with the existing MCP Caddy gate preserved.
  Cache invalidations and workflow external endpoint checks complete.

## Independent production verification

- Active release `20261010182852-9b51cce83a47` runs API/worker digest
  `sha256:3873f6afab8f9123dd7f48a8913e2f64b2e28bcb35f335a933dc7e94786440bf`.
  Both revision labels and package versions match the deployed source / 1.16.1.
  Containers are healthy with zero restarts/OOMs; worker postgres-v1 processing
  is enabled. API started 18:29:36 UTC and worker 18:29:45 UTC.
- Ledger remains 58; public-status migration checksum and original application
  time (12:42:17.284 UTC) are unchanged. All three publication tables remain.
  Managed database is private/available with backups enabled and latest
  restorable time 18:31:18 UTC. No bootstrap, new migration or customer writes
  were performed by verification.
- Fifteen independent HTTP checks pass: exact app build SHA, API/MCP readiness,
  updated website guide/reference, status SPA routing, OAuth issuer/challenge,
  owner settings/options, private anonymous rejection and generic absent-page
  404/no-store. An existing enabled page returns 200/no-store with exactly the
  allowed aggregate keys, one project/check and 30 daily entries.
- Saved publication settings hash and public ID are identical before/after.
  Thirteen served asset markers verify auto-save/link/preview-focus behavior,
  device themes, attribution and shared tooltip handling; favicon matches source
  and loopback mock links are absent. Source tests prove interaction behavior;
  no browser/screenshots were used under the execution contract.
- A scheduled API health check passes after both new containers started, with
  zero failures. The scoped pre-existing incident stays at three occurrences
  with last activity October 6; no new incident or recurrence is observed.
- Retention independently verifies exactly active plus previous stable
  `20261010124130-3097d00cdb0a`, retaining both API/worker images at previous
  digest `sha256:99961a4d911d79ac053f02642c7207d5acdba253c8e0db5eb36c9bada58103b2`.
  Repo-owned retention dry-run reports zero directory/image candidates; disk
  has 45 GiB free.

Ignored `.tmp/public-status-patch-*` logs/readbacks and ledger retain the operator
proof. Final documentation/provenance-only commits do not change the deployed
source/image identities above. No independent package/marketplace or OpenAI
portal publication was performed for this UI/documentation patch.
