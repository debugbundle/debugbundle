# Smart Report reliability and dashboard release — 10 November 2026

Status: core, dashboard, documentation and npm releases live and verified;
strict ClawHub acceptance remains partial.

The Owner authorised publication and production deployment of the audited Smart
Report, analytics and dashboard changes. The new Smart Improvements product,
report tier packaging, Analytics marketing page and additional restricted-output
project-name safeguard remain deferred. Consumer products are outside this release.

## Qualification and versions

Before release preparation, all 173 core and seven site files matched the audit
manifest qualified in
`production-readiness-smart-reports-ui-20261110.md`: 6,382 tests across 804 files,
including 390 database cases, with unchanged coverage gates. Release metadata and
packaging checks are repeated on the final committed source; GitHub CI must pass
before rollout.

- Core 1.24.0: a minor release for the additive analytics filter-options API,
  alongside Smart Report reliability and dashboard fixes.
- CLI/MCP/OpenClaw 1.22.0: additive filter-options commands/tools; existing
  restricted catalogues and default OpenClaw permissions remain unchanged.
- Shared types 3.4.0: additive filter-option schemas. Redaction stays at 2.7.1;
  publishing its unchanged artifact is not part of this change.
- Site 1.8.1: documentation and generated reference correction only.
- Language SDKs and the independent OpenAI plugin retain their current versions.
  Existing developer-plugin MCP pins are reviewed separately from npm publication.

## Ordering and preservation

1. Commit the reviewed candidate to an isolated release branch and run full CI.
2. Publish shared types through the existing shared-JS workflow, retaining the
   exact already-published redaction artifact. Update internal dependency pins
   only after registry availability and consumer checks pass.
3. Use the private cloud image workflow to deploy the API/worker before client
   distribution. Preserve all activation, access, model and budget settings.
4. Apply `202611090001_add_report_model_diagnostics` through the ordered migration
   runner before candidate startup. Preserve all old ledger checksums. The new
   nullable diagnostic is outside the immutable historical receipt hash.
5. Publish CLI/MCP and perform the mandatory ecosystem/native-artifact checks.
   Retired Smithery publishers stay excluded; platform scan/discovery gaps must
   remain explicit rather than being described as green.
6. Promote qualified sources and publish app/site assets from exact commits.
   Publish canonical core/site releases through their existing workflows.
7. Verify deployed revisions/digests, API/worker readiness, migration ledger,
   retained reports/receipt hashes, private-choice access controls and actual
   served assets. Retain exactly the active and verified previous stable images.

No paid generation, implicit retry, report regeneration, email resend, historical
repair or consumer adoption is authorised by release verification. Use existing
reports and normal production activity for read-only acceptance. The stronger
restricted-output name guarantee is not claimed by this release.

## Evidence

Sanitised local receipts and logs: `.tmp/release-20261110/`. Exact source refs,
workflow results, publications and live verification will be recorded below.

- The 173 audited core files and seven site files matched their final audit
  hashes before release metadata changes. The existing API/worker were healthy,
  with zero restarts and 44.6 GiB free disk. Protected baselines include 62 project
  tokens, 12 member tokens, 17 alert rules, 33 service definitions, the original
  factual report, its settled AI receipt and all 86 migration entries.
- Shared types 3.4.0 published through workflow `42830821448`; exact registry
  consumer smoke passed. The unchanged redaction publication was retained.
  Internal adoption changes only that package pin and its lockfile integrity.
- Native OpenClaw emitted checks and the current 2026.11.2 installed fixture
  pass. The local archive fixture requires the documented explicit source-trust
  and capability acknowledgements; remote publication/install policies remain
  unchanged. All 45 release-distribution regressions pass.
- Final packaging found a repeated filter-options entry in CLI help/generated
  references. A failing public-help regression demonstrated the duplication;
  remove only the repeated entry and regenerate the reference before final CI.
- Existing Codex, Claude and Gemini packages retain their already-published MCP
  1.21.0 pins and existing contracts. This optional additive read does not require
  a developer-package republish; direct npm MCP/CLI and OpenClaw receive 1.22.0.
- Final-source CI `42831838655` passed unit, project-scope and other Business
  groups but failed the analytics-choice suite setup. The referral readiness
  regression deliberately removes its commission constraint and ledger entry;
  the new choice fixture then reused that invalid schema. Running those suites
  sequentially in an owned tmpfs database reproduced `referral_schema_incomplete`.
  The choice fixture now resets its own disposable schema before bootstrap and
  migration, matching the existing integration pattern. Production readiness,
  migration SQL/checksums and all behavioural assertions remain unchanged.
  The exact failing order is now Green: nine referral cases and six choice cases
  pass, including the deliberate fail-closed checks. Fixture lint/format pass.
  Minimum-host OpenClaw installation and all 45 distribution cases also pass.
  Full exact-source CI was required again and passed as recorded below.


## Published and deployed verification

The deployed product commit is `78783e7cb12b6f0c49e874e1287236e317c9f995`;
site is `2245639aab088292370ed7a58355e43ba08b314f`; cloud orchestration is
`a813089f9902c1f2f4470f5b0ece5093115f28e6`. Subsequent documentation/evidence
commits retain these immutable runtime and asset identifiers.

| Surface | Exact-source result |
| --- | --- |
| Full core CI | [42841110248](https://github.com/debugbundle/debugbundle/actions/runs/42841110248), passed: 6,367 main-lane cases plus 16 required PDF cases, native jobs and unchanged coverage gate for 90 changed sources. Eighteen sources use its existing changed-line rule; no waiver. Merged lines 88.24%, functions 89.86%, statements 86.87%, branches 78.96%. |
| CLI native compatibility | [42841110488](https://github.com/debugbundle/debugbundle/actions/runs/42841110488), passed. |
| Shared types | [42830821448](https://github.com/debugbundle/debugbundle/actions/runs/42830821448), registry smoke passed; clean install independently confirms the new filter query/response exports. [Shared release](https://github.com/debugbundle/debugbundle/releases/tag/shared-js-v3.4.0). |
| Backend | [42848814140](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42848814140), passed with assets held until backend acceptance. |
| CLI/MCP | [CLI 42850130953](https://github.com/debugbundle/debugbundle/actions/runs/42850130953) and [MCP 42850138780](https://github.com/debugbundle/debugbundle/actions/runs/42850138780), passed including packed/registry/native client checks. |
| Published reader paths | Clean installed CLI/MCP 1.22.0 each execute the new scoped authenticated read against an isolated loopback fixture; the actual published MCP catalogue has 193 tools. No production credential or paid call participates. |
| Dashboard | [42852886471](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42852886471), passed from the exact product commit. |
| Website | [42852895723](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42852895723), passed. Site source CI 42831840528 and main CI 42852880629 pass; the earlier tool-count failure compared the new docs with pre-promotion core main, and passes unchanged after promotion. |
| Canonical releases | [Core 1.24.0](https://github.com/debugbundle/debugbundle/releases/tag/v1.24.0), workflow 42851718964; site 1.8.1, workflow 42852885297; both release gates passed. |

Active runtime `20261110155505-bc4abb438bed` uses immutable digest
`sha256:63ebed3cd7eec3cadbcc1bc6577ba66516888f963d23883c03502e50dda8d499`.
Both API and worker report core 1.24.0 / Node SDK 3.2.2, healthy with zero restarts
and no OOM kill. Six critical source files per role match the deployed Git commit;
shared types 3.4.0 is present. Exactly the active and verified previous stable
`20261109154519-d8845ede223f` / core `7917ec35` image pair remains.

The pre-migration managed snapshot is available. Ordered migration adds only
`202611090001_add_report_model_diagnostics`, yielding 87 entries with all 86 old
ledger rows/checksums unchanged. The nullable text column and validated allowlist
constraint are present. The old rejected attempt still has an unknown diagnostic;
its full established receipt projection/hash/cost is unchanged. Original factual
canonical content, report row, project/member tokens, alert/service definitions,
report allowance and selected AI/billing/access environment hashes are unchanged.
No model call, paid regeneration, email resend or historical backfill was used.

Authenticated production filter choices and retained report content/HTML reads
pass. Anonymous choices return 401 with `Cache-Control: no-store`. All 26 checked
CDN resources match S3 origin bytes and cache policy, including the dashboard's
exact build marker, fourteen site script resources, five changed guides and the
source-matching OpenAPI/reference JSON. Browser/device and new paid-generation
acceptance are not inferred from these checks.

API and MCP `/ready` return 200; all eight installed alarms are OK and all three
saved health checks have fresh passing HTTP 200 observations. No new active
incident IDs appeared. The pre-existing reviewer-credential expiry warning remains
open, with observed occurrences increasing from 36 to 38; it was not silenced,
resolved or used as evidence of a Smart Report failure.

## External distribution limits

The official Registry resolves exact MCP 1.22.0. Its expired publisher JWT was
renewed through the existing DebugBundle DNS ownership signing flow; no signing
key was printed/copied and no DNS record or consumer configuration was changed.
Only the failed pre-publication attempt was resumed; accepted target receipts are
retained immediately in `.tmp/release-20261110/ecosystem-accepted.json`.

ClawHub exposes the exact skill and OpenClaw package 1.22.0. Both platform reviews
are benign/clean, skill moderation is unblocked, and normal public installation on
OpenClaw 2026.11.2 loads the exact package and passes installed native scoped reads.
No force/security bypass was used. Its strict acceptance gate still fails:

- Completed antivirus evidence is absent for both distributions.
- Skill discovery passes five of seven bounded queries; the broad error-reporting
  query and incident-response query remain outside the required rank.
- The provider's newer skill verification explicitly reports `card.missing` and
  unavailable server-resolved import provenance. Its security review also notes
  an unresolved project-local reference; the final review adjudicates the low
  heuristic flags benign. The full findings remain in the retained report.

Public upload, benign review and installed-byte proof do not waive these gates.
Do not describe every external channel as fully accepted. Glama's API read returns
401 and LobeHub remains a manual discovery check; neither is an authorised push
channel. Retired Smithery publishers were excluded. No OpenAI portal release,
developer-plugin republish, SDK release or consumer adoption is claimed.
