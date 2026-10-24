# Incident follow-up release — 24 October 2026

## Deployed sources

| Component                             | Version | Immutable source                           |
| ------------------------------------- | ------- | ------------------------------------------ |
| Core API, worker and dashboard        | 1.19.3  | `c991294ccad14ee5eb257daac38fc58a0cdc1451` |
| Public site                           | 1.6.10  | `f7299dae6a42c0840821c685046b1d3aa0a8b015` |
| Private cloud workflow and edge rules | —       | `40606e14e156a0d27a6ca2b4ba2531d2aee1e677` |

API and worker use immutable digest
`sha256:989943577cd5b5137bfa3b21bdc599afa38653668b6ce12954cf0f30b2280b81`.
The [hosted rollout](https://github.com/debugbundle/debugbundle-cloud/actions/runs/40074921136)
completed successfully. Later documentation/provenance commits do not change these deployed identities.

The earlier 1.19.2 tag remains unchanged: its fresh canonical audit failed before
GitHub release creation or production deployment. Replacement 1.19.3 updates
body-parser to 2.4.0 and Undici 8.x to at least 8.12.2 (direct 8.12.3), retaining
the owner-approved hash/semantic-verified Zod 3 backport. The registry still flags
the legacy Zod version; other findings keep their severity gates. The final
qualified core audit has nine low, 35 moderate and zero unaccounted high/critical
findings. Site's stricter local low gate passes with the same exact verified
legacy exception. No consumer product or independently installed SDK was changed.

## Resulting behaviour

Failed initial session and billing reads have existing-component error/retry
states. Session unavailability stays distinct from confirmed sign-out. Billing
read/poll retries retain loaded data and the original Checkout context without
creating another purchase. Explicit session refresh, permissions, cancellation
and revision fences retain their contracts. Stable loading-label elements
mitigate the reproduced translated-text DOM ownership failure class; the
historical browser mutation tool is not identified. No broad application-error
suppression or translation opt-out was added.

The public-site edge canonicalizes repeated/raw-backslash path separators to
same-origin paths. Existing query values, encoded separators, asset rules and
404 behaviour remain supported. The shared blog CTA remains centred, docs
before the primary homepage action, contrasting in both themes and without an
eyebrow. The prior trial-start/payment-unlock notice fix remains included.

## Qualification and independent readback

- The complete preceding local run passes 4,668 tests in 566 files / 100 coverage
  shards. The final replacement SHA passes the unchanged original-baseline
  coverage gate for all six runtime files. Runtime UI source is unchanged by
  the replacement dependency-only commit.
- Replacement [core CI](https://github.com/debugbundle/debugbundle/actions/runs/40072937372),
  [CLI compatibility](https://github.com/debugbundle/debugbundle/actions/runs/40072937358),
  [site CI](https://github.com/debugbundle/site/actions/runs/40072852402),
  [canonical core release](https://github.com/debugbundle/debugbundle/actions/runs/40074434072)
  and [site release](https://github.com/debugbundle/site/actions/runs/40073120342)
  pass. Core CI reruns the full coverage suite on the replacement dependency graph.
  Its manifest-only comparison has no changed runtime files; the separate
  original-baseline coverage check supplies that coverage evidence.
- Current focused verification passes 75 OAuth/CIMD/MCP transport tests, 20
  security/release tests, 13 committed-provenance tests and all 49 site tests,
  with typechecks, audit, production builds and lint passing at their relevant gates.
- Independent API/worker inspection confirms version/source/digest, healthy
  containers with zero restarts, active `postgres-v1` processing, unchanged
  public configuration and reviewer expiry, installed backport hashes/semantic
  probes, request-library versions and changed-source hashes.
- Migration gate reports `applied=0; already_applied=63`. No new schema is introduced.
- Retention independently validates exactly the active release plus verified
  1.19.1 and both immutable API/worker image pairs; no cleanup candidates remain.
  About 44.8 GiB remains free. API/MCP readiness and the saved readiness monitor pass.
- Live SPA bytes/build identity contain the new retry states. All 28 live blog
  CTAs pass structural/style checks, generated references identify core 1.19.3,
  and `//robots.txt` redirects with 308 to `/robots.txt`, preserving a query,
  followed by HTTP 200. Private billing remains 401 without authentication.

No browser visual review, exact owner-session reproduction, production payment,
customer email or consumer-product canary is claimed.

## Incident closure checkpoint

At 07:50 UTC on 24 October, independent explicit-project active and paginated
all-status reads confirm:

| DebugBundle project       | Active | Resolved |
| ------------------------- | -----: | -------: |
| API                       |      0 |       44 |
| App                       |      0 |       19 |
| Site                      |      0 |        7 |
| WordPress SDK development |      0 |        0 |

Thirteen App/Site extension/noise or recovered records were closed after narrow
rule readback/recovery evidence; the eleven application/path records were closed
only after deployed verification. Ordinary DOM/fetch/application failures remain
captured. No consumer project was queried for incident contents or mutated.

The OAuth regression also recovered: fresh production `/oauth/token` returned
200 at 07:48:45 UTC, followed by an admitted authenticated `list_services` call
returning 200 in 55 ms without timeout/cancellation. It was resolved after this
proof. Earlier metadata/JWKS 404 and token 400 responses are retained in private
notes; the cause of that interval is not established, and recovery is not
attributed solely to the dependency patch. No OAuth security policy was weakened.

OpenAI 1.0.2 candidate source and deterministic package remain included. Reviewer
expiry stays 23 November 2026. The retained synthetic reviewer corpus, accessible
recording and owner portal submission/publication gates remain separate.
