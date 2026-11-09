# Business implementation qualification

8 November 2026, Europe/Ljubljana. Local implementation of the owner-approved
[Business contract](business-tier.md), FR-BUS-01–06 / AC-BUS-01–08. The single implementation phase is complete and locally qualified. Publication,
production activation and provider/owner acceptance remain separately scoped.

The follow-up trial/report/pricing audit is recorded in
[the launch review](business-launch-review-20261108.md). It supersedes this record's
candidate identity and migration count. The original runtime context is retained
at `.tmp/business-runtime-candidate-before-audit/`; the paths below describe the
historical qualification and are not the latest release candidate.

## Candidate identity

The candidate is uncommitted work based on
`e113414540aa00ebbbac12ea0783ee0c16eacbaf`; that commit alone does not contain the
implementation. The retained source manifest and local runtime image identify the
actual candidate bytes:

- Runtime source SHA-256:
  `fe4732df0ee1ac57b2fa53aed0ee14272c05cadc09c1e2bab31b96687b80d77d`.
- Runtime image ID:
  `sha256:c74e7577420bc08c1efab379f5e076a220c84ed4f5b4676334ef144f6b297e75`.
- Source manifest: `.tmp/business-runtime-candidate/runtime-source-manifest.json`.
- CLI, MCP, OpenClaw, dashboard and public-site archives with exact hashes:
  `.tmp/business-implementation/artifacts/manifest.json`.

The source-only build context excludes credentials, operator files, unrelated
products and repository metadata. Its helper rejects symlinks, foreign paths,
oversized input and an existing destination, and verifies copied source hashes.
The actual runtime image builds with the frozen lockfile and reports
`business-tier-v1`, `project-services-v1` and `postgres-v1`. Its bundled PDF fonts
pass integrity checks with networking disabled. These are local unpublished
candidates with existing version metadata; publication requires selected new
versions and the corresponding exact published-artifact gates.

## Functional inventory and acceptance

| Acceptance | Owning modules and paths                                                                                                                                            | Qualification boundary                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-BUS-01  | Shared tier/catalogue types; billing catalogue, reservations, quotes, upgrades and renewal schedules; storage allowance windows; tier health enforcement            | Monthly/yearly prices and matching capacity, 0–99 quantities, annual month-end/leap-day windows, consumed usage, stale/pending provider state and deterministic health pausing. Legacy monthly adapters and Free/Solo invariants retained.              |
| AC-BUS-02  | Organisation management/access storage, unique-person admission, invitations and accepted ownership transfer; organisation client and thin API/CLI/MCP/web adapters | Actual role/delegation checks, unique identity/invite accounting under one organisation lock, suspension/removal, workspace switching, transfer races and durable current-owner contact synchronisation. No speculative grandfathering or seat billing. |
| AC-BUS-03  | Auth action policy, member-token policy, API member-token guard, project job initiators, artifact readers and merge inventory                                       | Live authority intersected with credential and frozen origins at reads, writes, queued execution and publication. SDK-only authentication and installed legacy cross-org tokens remain separate. Viewer/restricted credentials cannot escalate.         |
| AC-BUS-04  | `packages/referrals`, referral stores and receipt processor; personal/operator finance adapters                                                                     | Verified collected Business base cash only; chronology, first eligible invoice benefit, anniversary/proration, cumulative rounding, refunds/disputes, uncertain reconciliation and atomic manual payout claims. No automatic transfers.                 |
| AC-BUS-05  | Smart Report lifecycle, availability, health, analytics, context and coverage collectors; canonical content                                                         | UTC comparisons, resolved/recurrent/unresolved issues, retained evidence and honest missing coverage. Numeric/source/report retention and privacy remain separate; no inferred resolution or invented account outage.                                   |
| AC-BUS-06  | Smart Report admission, scheduling, model attempts, canonical HTML/PDF/email, report clients and worker serial lane                                                 | Shared allowance/budget, fenced claims, no locks across expensive I/O, current whole-scope creator/reader/recipient authority, strict model/schema/source validation, bounded isolated PDF and receipt-backed email uncertainty.                        |
| AC-BUS-07  | Seventeen ordered storage migrations, exact readiness ledger, runtime composition and private cloud deploy/rollback guards                                          | All 66 historical migrations unchanged; 83 total. Populated predecessor upgrades, checksum/missing-schema rejection, migration-before-code and compatible retained API/worker rollback. Bootstrap remains empty-schema only.                            |
| AC-BUS-08  | Conservative analytics capabilities, existing performance harness and report resource proof                                                                         | Chosen conservative analytics fallback and measured local processing bounds. Broader full-exhaustion infrastructure/cost certification is owner-deferred.                                                                                               |

API/OpenAPI, CLI help, ordinary MCP descriptions and public guides describe the
new operations. Frozen legacy MCP metadata is retained; its explicitly additive
member-token options have their own fixture. Hosted/restricted MCP and OpenAI
OAuth catalogues are unchanged. The approved existing design tokens, primitives,
native billing interval selector and reusable components supply the private UI.
Public pricing includes monthly/yearly base and capacity pricing, support scope,
Business and contact-only Enterprise.

## Failure, trust and cleanup review

- Inputs are validated at adapters and domain boundaries. Current actor/role,
  credential policy, suspension, plan and accepted origins are authoritative;
  request-provided roles and browser workspace state cannot grant access.
- Organisation admission, billing offers, quotas, claims and payout batches use
  durable transaction/lease boundaries. External provider work runs outside
  database locks. Ambiguous payment, model and email outcomes remain explicit
  reconciliation states rather than being blindly retried.
- Reports require access to every frozen constituent project. Canonical narrative
  is never filtered after generation. Evidence is bounded/redacted before model
  egress; the model has no tools or credentials. HTML/email escape untrusted text.
  The fixed PDF child has a deadline, bounded input/output and no arbitrary fetch
  or file access; its environment omits provider/database credentials.
- Private report and PDF objects have exact deterministic cleanup intents, current
  authority checks and bounded retention. Export uses database-precision cutoffs
  and paged indexed sections. Actual deletion removes owned content while
  preserving unrelated objects and required minimum financial obligations.
- SDK invitation/transfer secrets are protected before SDK retention/transport and
  server persistence/egress. Twelve maintained surfaces share the same 27-case
  portable corpus; wrapper/native candidate evidence is recorded separately in
  [credential redaction qualification](business-credential-redaction.md).
- Existing SDK acknowledgements, grouping/bundle determinism, project-token
  isolation, weekly digests, alerts/webhooks, sharing, merge origins and installed
  runtime paths remain regression requirements. Discovered authentication,
  consolidation, export precision and fixture-isolation failures were corrected
  against those requirements without replacing frozen contracts.

## Verification evidence

Receipts below live under `.tmp/business-implementation/` and contain synthetic
or disposable DebugBundle fixture evidence.

| Check                                                | Result / receipt                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full core unit/real-database coverage                | All 128 groups / 6,072 checks pass: `business-complete-coverage.log`. Its initial changed-source gate exposed 15 gaps; 93 focused checks and 14 fresh database checks pass. Merged evidence passes the unchanged policy for all 402 changed source files: `business-final-changed-coverage.log`.                                       |
| Core lint and typecheck                              | Full lint plus final root types and focused lint/style pass. The final organisation/keyboard regression recheck passes 9 cases: `business-final-types-lint-regressions.log`; frozen MCP contract recheck passes: `business-final-toggle-contract.log`. The default 2-GB check exhausted its heap; the established 4-GB setting passes. |
| Full integration suite                               | 84 files exercised, initially 542 passed / 2 failed / 1 optional installed-browser fixture skipped. Both remaining failures pass the 9-case export/installed-runtime recheck: `business-export-runtime-final.log`.                                                                                                                     |
| Site tests, types, static build and 404              | Pass: `business-site-qualified-build.log`. Final CLI/MCP/OpenClaw/dashboard rebuild and archive retention pass: `business-final-candidate-build.log`, `business-final-candidate-pack.log`.                                                                                                                                             |
| Private cloud workflow/image/rollback/context guards | 44 tests pass: `business-cloud-final-qualification.log`.                                                                                                                                                                                                                                                                               |
| Runtime image and offline font integrity             | Final rebuilt image and offline font checks pass: `business-final-runtime-image.log`, `business-final-runtime-fonts.log`.                                                                                                                                                                                                              |
| Core dependency audit                                | Zero high/critical findings under existing policy; 9 low / 39 moderate: `business-final-dependency-audit.log`.                                                                                                                                                                                                                         |
| SDK local candidates                                 | Node/Browser 614 tests, lint/types/coverage and exact Node 24/26 packages; staged WordPress ZIP; Swift archive/privacy/SPM/CocoaPods/iOS floor; RN packed/Android/bare iOS/Expo iOS pass. See the credential-redaction record for receipts and source-language corpus checks.                                                          |
| Public local preview                                 | `/docs`, `/pricing/`, `/docs/pricing/`, `/docs/smart-reports/`, `/docs/referrals/` return 200 at port 5292. Served checked bodies match `site/out`; `/docs` redirect retains the port.                                                                                                                                                 |

Coverage combines all 128 original passing group reports with two focused reports.
The sole later runtime edit removes an unused storage helper; its old coverage entry
is replaced by fresh real-database coverage rather than merging obsolete line maps.
The final merged totals are 87.93% lines, 86.55% statements, 89.50% functions and
78.40% branches. Existing changed-file/changed-line policy and thresholds are
unchanged; the merge receipt is `business-final-coverage-merge.log`.

The local preview required recreating only its Nginx service after Next replaced
the export directory inode, plus relative redirects in the existing ignored
preview config. No browser or screenshot was used. Recreating this bind mount is
necessary after another export replaces the directory.

The maximum local report has 10 projects, 140 metrics and 100 sources. Three serial
real PDFs total 406,575 bytes in 2.843 seconds. Ingestion p95 is 19.07 ms from the
predecessor source, 12.14 ms current and 13.33 ms under PDF pressure, below the
200-ms gate; all 600-request response matrices match. Sampled parent peak
414,650,368 bytes and child peak 227,328 KiB include test/compiler overhead. A
blocked synthetic model and seven queued reports leave a real one-connection pool
available; six ordinary journal operations complete within 2 ms. The existing
current harness also passes: ingestion 8.1 ms, generation 1.1 ms and retrieval
1.46 ms p95. The predecessor's older general harness had an invalid fixture UUID,
so only ingestion has a valid predecessor comparison. Receipts:
`business-report-resource-proof-green.log`, `business-current-perf-valid-token.log`.

The approved synthetic model evaluation spent exactly USD 0.31524845 over 127
paid attempts, with zero uncertain holds, within the USD 1 total approval. Terra
passes 9/9 factual gates and improves mean quality from 3.225/4 to 3.8/4. The
selected 12,000-input/1,500-total-output, single-attempt regional profile reserves
USD 0.02475/run, at most USD 0.99 for 40 runs. Evaluation results, fixture hashes
and limitations are in [the evaluation record](../evals/smart-reports/results-20261107.md).
Temporary Afipal key copies were removed; no Afipal source, settings, data or
deployment changed. No additional paid evaluation is needed.

## Release and activation boundary

No commit, push, publication, deployment, production/provider mutation, automatic
transfer, real notification or consumer-product adoption occurred. Business sales,
new Smart Report generation and email egress default off. Archives, existing
debugging and reconciliation retain their documented behaviour.

An authorised release still needs versioned exact-artifact publication where
applicable; provider catalogue/coupon/identity configuration and test journeys;
migration-first deployment from one revision; Business-aware active and retained
rollback API/worker pairs; live resource/headroom checks; and owner/provider
acceptance. The first compatible bridge deploy keeps sales off; a later deploy
retains that compatible rollback before activation. No extra AWS resource was
provisioned, and local pressure tests do not certify hosted full-capacity margin.
The owner-deferred broader cost analysis is not an implementation blocker.
