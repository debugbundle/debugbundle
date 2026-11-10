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
