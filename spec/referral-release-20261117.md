# Affiliate and pending-work release — 17 November 2026

The owner authorises committing all pending DebugBundle work, merging the main
repositories and running normal release flows. The affiliate article is included
following local blog review. Scope is DebugBundle only; consumer products remain
outside this release.

## Distribution eligibility

| Surface                               | Decision | Version  | Shipped change                                                                             |
| ------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| Hosted core                           | Publish  | 1.28.0   | Versioned referral offers, payout preferences, creator emails and browser-session renewal. |
| Public site                           | Publish  | 1.11.0   | Affiliate programme discovery, pricing/offers and introduction article.                    |
| CLI                                   | Publish  | 1.26.0   | New referral/offer and payout-preference commands with delegated operator authority.       |
| Standard MCP                          | Publish  | 1.26.0   | Matching schemas and tools; restricted hosted catalogues remain unchanged.                 |
| OpenClaw companion                    | Publish  | 1.26.0   | Bundled MCP functionality and optional referral/payout tools.                              |
| Codex developer plugin                | Publish  | 1.9.0    | Exact MCP pin adopts new tools.                                                            |
| Gemini extension                      | Publish  | 1.8.0    | Exact MCP pin adopts new tools.                                                            |
| Claude Code plugin                    | Publish  | 1.25.0   | Exact MCP pin adopts new tools.                                                            |
| SDKs, shared JS, hosted OpenAI plugin | Retain   | Existing | No changed shipped SDK/schema/redaction or restricted hosted tool behaviour.               |

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

Further immutable workflow/artifact references are added as each gate completes. Historical local review records retain their original
scope and do not establish production payment or mail acceptance.

The first complete coverage run found a stale Claude marketplace version and
distribution-ledger rows, an outdated referral consent/link test, and new email
previews changing the established sign-in preview selection. The marketplace and
ledger now match the selected independent versions, the referral assertions follow
the approved card and local-site link contract, and the new previews are appended
without changing the default. All existing consent, retry, CSRF and code-sharing
assertions remain enforced. Full CI must qualify the corrected source before merge.

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
