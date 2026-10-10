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

No API, domain, schema, runtime configuration, dependencies or independent package
versions change. The existing 58-migration ledger and additive public-status
migration remain required. Public projection/privacy, CSRF and ownership checks
are unchanged. No customer publication or monitoring state is changed to verify
the release. Website source is retained at its verified current commit.

## Qualification

Before release preparation, all 78 focused and adjacent tests in 11 files, both
changed-source coverage gates, focused lint, repository typecheck and candidate
builds passed. Tests cover first-enable validation, saved/draft separation,
existing empty configurations, pending/failure/retry states, late responses,
preview focus, clipboard fallback and collaborator restrictions.

Fresh launch qualification passed 78 tests in 11 files and both changed-source
coverage gates, repository typecheck, candidate builds and high-severity audit
(no high/critical findings). Full repository lint and exact-source CI/release
checks are required before deployment. Logs are retained in ignored
`.tmp/public-status-patch-{coverage,typecheck,build,audit,lint}.log`.

Read-only production baseline: core 1.16.0 source
`f658a487f58807c1eaab2bdcd6cd2dfcb45cd338`, both containers healthy with zero
restarts/OOMs, worker processing enabled, migration ledger 58 with unchanged
public-status checksum. API health passes with zero consecutive failures;
local active incidents are empty, and the scoped cloud incident remains at three
occurrences with last activity on October 6. Managed PostgreSQL is private and
available with backups enabled (latest restorable 17:41:22 UTC); disk has 45 GiB
free and memory headroom passes the normal rollout floor.

Deployment is pinned to trusted cloud
`b5693be75a31e791c25a8a9cb16a1a96bc7951c8` and unchanged website
`84fa7bc1247ad605dc22796a8dc8e659ff80ad52`. Exact product/workflow identities
and independent production readbacks will be recorded before marking complete.
