# Affiliate and pending-work release — 17 November 2026

The owner authorises committing all pending DebugBundle work, merging the main
repositories and running normal release flows. The affiliate article is included
following local blog review. Scope is DebugBundle only; consumer products remain
outside this release.

## Distribution eligibility

| Surface                               | Decision | Version  | Shipped change                                                                       |
| ------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------ |
| Hosted core                           | Publish  | 1.28.1   | The 1.28.0 features plus the diagnosed reviewer-expiry startup correction.           |
| Public site                           | Publish  | 1.11.0   | Affiliate programme discovery, pricing/offers and introduction article.              |
| CLI                                   | Publish  | 1.26.0   | New referral/offer and payout-preference commands with delegated operator authority. |
| Standard MCP                          | Publish  | 1.26.0   | Matching schemas and tools; restricted hosted catalogues remain unchanged.           |
| OpenClaw companion                    | Publish  | 1.26.0   | Bundled MCP functionality and optional referral/payout tools.                        |
| Codex developer plugin                | Publish  | 1.9.0    | Exact MCP pin adopts new tools.                                                      |
| Gemini extension                      | Publish  | 1.8.0    | Exact MCP pin adopts new tools.                                                      |
| Claude Code plugin                    | Publish  | 1.25.0   | Exact MCP pin adopts new tools.                                                      |
| SDKs, shared JS, hosted OpenAI plugin | Retain   | Existing | No changed shipped SDK/schema/redaction or restricted hosted tool behaviour.         |

## Release sequence and safeguards

1. Run source, build and database checks over all pending work; preserve existing
   migrations, credentials, business/report settings and project-merge activation.
2. Commit reviewed source on dedicated branches and qualify CI. Publish eligible
   CLI/MCP distributions before advertising new exact plugin pins on main.
3. Merge reviewed core/site/cloud source and release their selected versions.
4. Deploy the first offer-aware API/worker with new programmes disabled. Forward
   migrations must precede new consumers. Prepare a second compatible deployment
   so both active and retained rollback images understand saved offers.
5. Configure the dedicated payout encryption key without printing it; retain it
   for existing ciphertext. Preserve the separate referral-signing secret.
6. Enable the programme capability only after compatible rollback/readiness
   checks. Publish app/site assets and `/r/<code>` routing from pinned sources.
   No sample or local-review programme is seeded into production.
7. Verify CI/releases, public routes/build identities, migration readiness and
   deployment health. Record provider/customer checks separately from source and
   HTTP evidence. Real campaign configuration remains an operator decision.

## Dependency advisory discovered by CI

The 17 November audit reports GHSA-fc5q-39xc-vjpf for transitive picomatch 4.x
in core build tooling and site content compilation. Upstream has no published
fixed version. The prepared 4.0.7 patch extends the existing repeated-extglob
risk fallback to unbounded wildcards in single and nested branches, preserving
escaped literals, character classes and safe nested-extglob rewrites. Risky
patterns follow the library's existing literal fallback instead of producing
nested unbounded regex quantifiers.

Exact patch/file hashes and bounded child-process semantic checks are required
before the audit accounts for this one advisory at this exact version. Unpatched,
drifted, mixed-version and unrelated findings remain failing. The site vendors
identical policy, tests, patch and upstream MIT licence. This is a local security
patch, not an upstream fixed-release claim or a blanket advisory exception.

The owner explicitly approved both the dependency patch/lockfile updates and the
dedicated payout-key setup. Installation is complete in both Docker workspaces;
both high-severity audit gates pass with the exact verified patch. The dedicated GitHub secret
is configured and its protected recovery copy is retained. Existing referral
signing credentials are preserved. The lockfile package identities change only
from picomatch 4.0.4 to patched 4.0.7; other package versions are retained.

Sources: [upstream advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
[current parser](https://github.com/micromatch/picomatch/blob/4.0.7/lib/parse.js),
[related proposed branch analysis](https://github.com/micromatch/picomatch/pull/194).

## Evidence

CLI 1.26.0 ([workflow 44181480908](https://github.com/debugbundle/debugbundle/actions/runs/44181480908))
and MCP 1.26.0 ([workflow 44181485357](https://github.com/debugbundle/debugbundle/actions/runs/44181485357))
are published with actual registry-install and native-client checks passing.
The official Registry accepted and read back `com.debugbundle/mcp` 1.26.0 using
renewed existing DNS authentication. Both direct and nested wildcard attack
probes, ordinary glob compatibility and exact installed hashes pass in core/site.
No other dependency package identity changes.

Historical local review records retain their original scope. The publication
receipts below establish hosted deployment separately from real payment or mail
delivery; neither customer canary was run.

The first complete coverage run found a stale Claude marketplace version and
distribution-ledger rows, an outdated referral consent/link test, and new email
previews changing the established sign-in preview selection. The marketplace and
ledger now match the selected independent versions, the referral assertions follow
the approved card and local-site link contract, and the new previews are appended
without changing the default. All existing consent, retry, CSRF and code-sharing
assertions remain enforced. Full CI 44202555281 qualified the corrected source,
and 44209119027 passed on its exact-tree merged main. The later runtime correction
passed full CI 44213587983 before its exact-tree merge to the deployed source.

The public ClawHub companion 1.26.0 installs normally on OpenClaw 2026.11.5 with
no force override. Both distributions have a final benign security review; the
provider adjudicated individual Skillspector warnings as expected for the stated
purpose. A separate description-only skill patch 1.26.1 improves broad live-app
discovery to rank 1. Six of seven bounded search checks pass; incident response
remains rank 17 against the top-10 gate. This limitation is retained explicitly.

The live configured Stripe catalogue was read without writes: all six base
plan/interval prices and purchasable capacity match advertised USD amounts,
with separate base and capacity products. No coupons, customer subscriptions,
payments or test emails were created. Cloud deployment guards additionally exclude
temporary operator evidence from image contexts and clear the API-only payout
encryption key from worker containers in every rollout path.

The corrected full run passed every executed test but caught a missing CI
registration for the existing creator-email database integration suite. That file
now runs in the regular isolated Postgres coverage shards. Its delivery, digest,
deduplication, retry, recipient and migration checks pass with the worker/template
tests (33 cases). Delivery has 100% statement/line/function coverage; event recording
has 92.68% statements and 100% lines/functions. No coverage threshold or assertion
was weakened, and no application logic changed for this correction.

## Initial hosted candidate and startup correction

The first disabled reader bridge, cloud workflow
[44211127654](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44211127654),
applied all three forward migrations (`applied=3; already_applied=91`) but did not
promote its candidate. The old API and worker remained healthy on the original
active release, without restarts. Public readiness stayed successful. No app/site
assets or programme capability were enabled.

A bounded unexposed reproduction of the exact immutable candidate traced startup
failure to `parseReviewerConfig`: the existing owner-approved reviewer expiry is
23 November, less than seven days away. The moving startup lifetime threshold
incorrectly rejected the still-valid configuration. Core 1.28.1 removes only that
threshold; structural checks, the unchanged deadline, authorization expiry denial,
audits and synthetic isolation remain. New regression cases first failed for five
days, the exact deadline and past expiry. They pass after the correction; separate
authorization tests deny at/after the exact deadline before provider interaction
or grant creation. This changes hosted runtime and qualifies a core patch release;
all independently published packages and plugins retain their selected versions.
This maps to NFR-MCP-04, AC-MCP-08 and SEC-11, without a schema or credential change.

## Published source and hosted verification — 18 November

The owner-authorised release is live at core 1.28.1 and site 1.11.0. Deployed core
source is `ab1402caa8b639a8e9d0e02ff5b71cfe10cfd3e4`; site source and its annotated
v1.11.0 tag resolve to `af7fbdb2a9d39a725ef89dac413e272fcbc7b256`. Hosted workflow
source is cloud `290eba43e2d9611fad03372cb979d09ef5bf4e83`.

| Gate                     | Immutable workflow receipt                                                               | Result                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Core patch qualification | [44213587983](https://github.com/debugbundle/debugbundle/actions/runs/44213587983)       | Full CI, native Gemini/Rust and installed CLI matrix pass.                                              |
| Core 1.28.1 publication  | [44220014285](https://github.com/debugbundle/debugbundle/actions/runs/44220014285)       | Canonical non-draft/non-prerelease v1.28.1 targets the tested merged source.                            |
| Site main qualification  | [44210571687](https://github.com/debugbundle/site/actions/runs/44210571687)              | Full site main CI passes.                                                                               |
| Site 1.11.0 publication  | [44210579920](https://github.com/debugbundle/site/actions/runs/44210579920)              | Canonical v1.11.0 and exact annotated tag are published.                                                |
| First disabled bridge    | [44221021748](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44221021748) | Healthy 1.28.1 API/worker, programme capability off, assets unchanged.                                  |
| Second disabled bridge   | [44222083295](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44222083295) | Active and retained rollback API/worker both support saved offers and creator emails.                   |
| Full publication         | [44223279079](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44223279079) | Capability enabled, app/site uploaded, edge rules and CDN invalidations complete, external checks pass. |

The active release is `20261118023146-717716a793a7`. Both API and worker use their
own GHCR repository reference at immutable digest
`sha256:a3167f509cfff7ecbc08c8a76fbfd3b18996f264328dfd6da082b36e52fa8d4f`.
The verified previous release is `20261118022007-0edabf6ff1f1`, with API/worker
digest `sha256:a94d38e9d7b2cc1117a5de4addf54131872b6699cbbaa84ff366aec15fa02005`.
Exactly those two release directories and all four immutable role references are
retained. Both have `referral-offers-v1`, `creator-referral-emails-v1`, Business/
report compatibility and the durable worker protocol. A disabled claim flag is
not permission to roll back to a pre-offer reader.

Read-only post-deploy snapshots verify both services at 1.28.1, healthy with zero
restarts, 94 ledger entries and all 91 original checksums preserved. Existing
credential, feature-setting and saved-configuration fingerprints match baseline.
The API's dedicated payout key matches the protected recovery copy; the worker
has no usable key. Disk is 23% used with 46,650,892 KiB available. All seven scoped
baseline alarms remain OK. A complete, project-scoped incident comparison uses
canonical incident IDs and pagination: the same 22 active records remain, without
new IDs or status changes. No incident lifecycle action was taken.

Nineteen independent public HTTP checks pass: exact app build identity, home,
affiliates, blog/index/article, generic terms, pricing, referral docs, sitemap,
robots, capability, public programmes/context, private access boundaries and
fixed-destination no-store referral routing. Footer order is checked on the three
marketing routes that share SiteShell; unchanged blog/docs layouts have their own
shells. Anonymous operator reads deliberately return the documented 404 concealment,
while creator and payout reads require authentication. Current JS/CSS CDN bytes
match their S3 objects and use immutable caching. Ten pre-publication hashed asset
references remain available for existing open tabs. These are HTTP/configuration
and artifact checks, not a browser or real customer-journey claim.

Codex 1.9.0 and Claude Code 1.25.0 pass fresh public marketplace installation,
upgrade, local retrieval, auth and removal checks with 232 ordinary tools. Gemini
1.8.0's public main/tag/release ZIP matches all five package files; native Node
22/24/26 and public Git checks pass. The runtime patch changes none of those
published package bytes. SDK/shared versions and OpenAI plugin 1.1.0 are retained;
the latter's local release packet is refreshed against the verified live API
digest without a portal publication or restricted-tool change.

## Explicit boundaries and remaining external discovery

No commercial or synthetic programme was created/activated; the live public
programme list is empty until an operator publishes an agreement. Capability is
available for that normal workflow. No coupon, customer subscription, real payment,
test email, transfer, consumer-product update or OpenAI portal action was used as
a deployment canary. Live Stripe catalogue and SES readiness are separate from
real provider transaction/delivery acceptance. Current encrypted preferences remain
retained after account unlinking under the existing contract; rejected destructive
cleanup remains a separate owner decision, not an added deletion trigger.

Exact ClawHub skill 1.26.1 and companion 1.26.0 pass completed final security review
and normal installation. The latest bounded discovery read remains 6/7: incident
response is rank 17 against the top-10 gate. The external search gate is partial,
and its release-command failure is retained honestly. No rank threshold was
relaxed, old package silently republished, or scanner finding hidden. Pull-based
directory follow-up and Gemini gallery indexing are separate from verified public
Git/registry availability.
