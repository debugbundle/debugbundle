# Smart Products release — 11 November 2026

Owner authorised publication, the usual release train and production deployment
of the approved Smart Products, public-site and app refinements. A separate
approval authorises synthetic weekly-review model qualification using the existing
DebugBundle report credential, capped at USD 1 / 40 provider requests, and activation
only if safety and usefulness pass. No other product is included.

## Version selection

- Core 1.25.0: additive factual reports, weekly review APIs and compatible v2 reads.
- Shared types 3.5.0: additive entitlement export and expanded paid-plan capabilities.
- CLI / MCP / OpenClaw 1.23.0: additive review management and factual report reads.
- Public site 1.9.0: Analytics page, product/pricing/docs updates, support chat,
  released-Business article and approved layout/accessibility refinements.
- Existing SDKs and redaction remain unchanged. Developer-plugin pins follow
  successful MCP publication and their own versioning/verification requirements.

## Rollout safety

Three ordered additive migrations precede new API/worker code. Retain legacy v1
projection and installed-client compatibility. First deploy the v2-capable runtime
with report/review generation disabled. Verify all serving readers and migrations.
Deploy the same code again with approved flags so the retained previous stable
runtime also understands v2 before factual reports can be generated. Keep the
Business, MCP, merge and existing report budget settings unchanged otherwise.
Do not roll back to a v1-only reader after v2 artifacts exist. Publish new app/site
assets only after backend acceptance. Existing weekly review settings stay off
until each Owner selects projects and grants consent.

## Qualification and acceptance

The unchanged weekly-review profile passed the synthetic evaluation in
`evals/smart-improvements/qualification-20261111.json`: sixteen paid attempts,
USD 0.0220396 actual cost, USD 0.396 maximum reserved, no customer data. Sixteen
input-token counter calls plus sixteen paid attempts total 32 provider requests.
Five inconsistent synthetic fixtures were corrected and rechecked, with all
original spend retained in the ledger. No-data and invalid-output safety paths
were checked without paid calls. Full guidance uses source symptoms and links;
restricted guidance avoids guessed detail. No UI inspection, action execution,
marketing recommendation or causal guarantee is claimed.

## Verified gates and first backend pass

Core source `5662ecfa9c4d317af1bb88a6dffc900f282da449` passes
[full CI](https://github.com/debugbundle/debugbundle/actions/runs/42933424182):
134 coverage shards, dependency audit, lint, types, PDF regressions and build.
The separate CLI compatibility matrix is green. The local complete Smart Products
suite passes 864 tests across 114 files; explicit baseline-to-candidate coverage
passes all 92 changed source files. Poppler-backed PDF checks pass 18 tests.

Shared types 3.5.0 was published and passed clean registry installation in
[the shared release workflow](https://github.com/debugbundle/debugbundle/actions/runs/42929270703).
Unchanged redaction 2.7.1 was verified by exact artifact integrity and retained.

The first paused backend pass completed on 11 November. Both serving images
report core 1.25.0 and the v2 reader contract. The migration ledger contains 90
entries, with all 87 previous checksums preserved and exactly the three approved
new migrations. Project, token, alert, service, report-definition, report-run and
model-attempt counts match the pre-deploy snapshot. This is aggregate preservation
evidence, not a claim of a byte-level database comparison.

Authenticated reads confirm the existing ready report remains available through
both default legacy and opt-in canonical document endpoints. Review settings,
allowance and the DebugBundle project's empty archive pass their response schemas.
The account remains disabled with no selected projects or source consent. These
checks generate no reports, send no messages and make no provider request.

The second backend pass also completed. Reports are restored and the qualified
weekly-review service is enabled. Active and retained rollback API/worker images
both support v2; the same 90-entry ledger and aggregate counts are preserved.
Authenticated reads pass again, and public readiness is healthy. A bounded read
of DebugBundle's own project found no new attention since rollout began. Existing
account opt-in settings were not changed. No consumer product was modified.

## Client and app release

[CLI 1.23.0](https://github.com/debugbundle/debugbundle/actions/runs/42939747992)
and [MCP 1.23.0](https://github.com/debugbundle/debugbundle/actions/runs/42939751580)
are published and pass their full release workflows, including fresh registry
installs and native client checks. Exact npm metadata is independently visible.
The app deployment is green and serves the new weekly-review route and People
controls from `index-I-IC5Zfb.js`, SHA-256
`50af24355b3ba7f7eb1aa1b074c597db76ae6a2062f57e378db4994e59d2d93e`.

Codex 1.7.0, Claude Code 1.23.0 and Gemini 1.6.0 adopt verified MCP 1.23.0.
Their package contracts and fresh native source and public Git installations pass,
including 199-tool discovery, authentication boundaries, local evidence, updates
and removal. Codex and Claude publish from core `5a1c3eb0`; Gemini publishes from
standalone `bfba800993d5e4a0f8e57a8765c1b9524a6c4a4c`, with native Node 22/24/26
checks green. Its [1.6.0 release](https://github.com/debugbundle/debugbundle-gemini/releases/tag/v1.6.0)
has a downloaded archive matching SHA-256
`459ee59fa8394c4d2f6c189cfcad123695de5ed0918f3abf5f2d355235ca6886`.
All five public files and the version tag match core. Gallery indexing remains
separate from public installation acceptance.

## Public site and canonical release

Site 1.9.0 is deployed from `a8ca5de80cec218da27358a058ce17974deec754`, using
product source `5a1c3eb0`. Site CI and its canonical tag/release workflow pass.
Live checks verify nine pages, canonical links, Crisp bootstrap, developer MCP
1.23.0 guides and sitemap entries for Analytics and the Business article. Pricing
serves Team's five selected projects / 25 reviews and Business's ten / 50; all five
testimonial figures retain native semantics. These are served-content and source
checks, not a new browser/device or Lighthouse score claim.

The [core 1.25.0 release](https://github.com/debugbundle/debugbundle/releases/tag/v1.25.0)
passes [its release workflow](https://github.com/debugbundle/debugbundle/actions/runs/42941747240)
at `5a1c3eb0`. Later documentation and developer-package commits do not replace
the separately recorded deployed runtime source `5662ecfa`. Runtime retention's
final dry run finds zero deletion candidates: active plus one verified previous
release remain, all containers are healthy and 45 GiB is free.

## External acceptance remains open

The official MCP Registry resolves exact version 1.23.0. ClawHub accepted both
the skill and OpenClaw plugin, and both exact versions are public. Final platform
reviews are clean/benign and skill moderation is clean, but required antivirus
results are absent. The skill also misses the required rank for two discovery
queries. Its low-severity heuristic warnings were adjudicated as expected by the
platform review; the unresolved local-reference coverage note is preserved.
Complete returned findings, receipts and disposition are retained in
[`smart-products-marketplace-20261111.json`](smart-products-marketplace-20261111.json).
Strict marketplace acceptance is **not complete**; no security bypass, threshold
change or automatic repeat upload was used. Smithery remains a retired publication
channel. This external gap does not change the verified production deployment or
the successful npm and developer-plugin installation results.

A normal public install of exact OpenClaw plugin 1.23.0 on qualified host
2026.11.3 passes installed native scoped requests. It uses the host's standard
capability consent and retains registry security enforcement, with no force flag.
This installation result does not substitute for the missing antivirus results
or the stricter discovery gate.
