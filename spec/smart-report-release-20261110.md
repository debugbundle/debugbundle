# Smart Report reliability and dashboard release — 10 November 2026

Status: authorised release preparation; production verification pending.

The Owner authorised publication and production deployment of the audited Smart
Report, analytics and dashboard changes. The new Smart Improvements product,
report tier packaging, Analytics marketing page and additional restricted-output
project-name safeguard remain deferred. Consumer products are outside this release.

## Qualification and versions

The candidate exactly matches the 173 core and seven site files qualified in
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
  Full exact-source CI is required again before production rollout.
