# Smart Reports and dashboard release review

10 November 2026. Scope: the complete uncommitted DebugBundle candidate on
`59d0adc7b962d1e0a49034325bfdeb16dd7ec142`, including Smart Reports, report previews,
shared empty states, alert/project layout and analytics forms/filter choices.
The Owner accepted the current appearance and requested an audit, explicitly
withholding release. No commit, publication, deployment, provider request,
production mutation or consumer-product change is part of this review.

## Decision

Locally qualified for release preparation, with no known unresolved blocker in
the reviewed changes. This is not release approval or production acceptance.
All 132 CI-equivalent groups passed: 6,382 cases across 804 test files, including
390 real database cases. The unchanged changed-file coverage gate passed all 90
changed source files. Focused reruns cover fixes made while that combined run was
in progress. Source manifests and logs are retained locally under
`.tmp/production-review-20261110/`.

## Findings and corrections

1. **Missing continuous database coverage.** The observed analytics choices
   integration suite was exercised during implementation but omitted from the
   registry consumed by `pnpm test`. Added it to the existing isolated Postgres
   coverage lane and added a release-governance regression. The new regression
   failed before the registry correction and passed afterwards. This keeps
   project/origin isolation, approved custom keys, privacy omission and payload
   bounds under continuous verification.
2. **Missing release notes.** Added an Unreleased changelog entry for the combined
   change, including the mandatory diagnostic migration and unchanged historical
   receipt semantics. No version bump or release action was performed.
3. **Distribution and public-doc drift.** The full unit run found two existing
   contract tests failing because the ordinary MCP catalogue gained a tool but
   its public count and generated OpenClaw manifest were stale. Regenerated the
   manifest through the package's pinned builder, preserving its optional-tool
   policy and existing default access. Updated the public API/CLI/MCP and
   dashboard filter guidance plus the OpenClaw README. The tests were retained.
4. **Production adapter coverage.** Existing tests separately exercised the HTTP
   contract and SQL reader. Added an integration regression that connects the
   real default API adapter to Postgres, checks scoped choices and the privacy
   response header, and asserts that no job is enqueued.
5. **Explicit private-response cache policy.** The new choices route returned no
   cache directive. A failing HTTP regression demonstrated the omission. Responses
   now carry `Cache-Control: no-store`, including failures, so HTTP caches cannot
   substitute old choices for fresh project/approved-key checks. No data exposure
   was observed or inferred from this missing header.

## Review coverage

The underlying requirements remain FR-BUS-05/06 in `spec/business-tier.md`,
FR-WEB-06/08/09/10/11 and FR-ANL-15/23/24/29 in `spec/requirements.md`, with the
corresponding acceptance criteria and
`contracts/smart-report-facts.md`, `contracts/public-interfaces.md` and
`spec/interface-parity-matrix.md`. Earlier focused qualification remains in
`spec/smart-report-ai-rejection.md`, `spec/smart-report-reliability-audit.md`,
`spec/analytics-ui-consistency.md` and `spec/analytics-filter-choices.md`.

| Boundary | Review and retained invariant |
| --- | --- |
| Provider and validation | Kind-specific evidence choices address the reproduced unsupported-claim rejection. The canonical validator still rejects unsupported claims, unknown references, numeric or unsafe prose and missing priorities/coverage. Provider HTTP success is not application success. |
| Privacy and factual output | New unsafe narrative becomes factual output; buffered legacy narrative is checked before publication. Bounded per-row redaction handles multilingual facts without widening the canonical evidence limits. Readers continue to fail closed on invalid/private content. |
| Receipts and budgets | Diagnostic codes are allowlisted and outside the frozen receipt hash projection. Old NULL diagnostics remain unknown. Success, rejection, uncertainty, worker recovery and duplicate settlement retain their existing charging semantics; no automatic paid retry was added. |
| Scheduler and storage | A recovered scheduler admits the saved overdue period once, then advances to the next future delivery. Existing locking, durable claims, cancellation, cleanup, expiry and generation admission remain in force. |
| Report interfaces | History, detail, canonical HTML, PDF and email retain factual meaning and source authority. Generation polling is serial, backs off on temporary errors, pauses offline/hidden, ignores stale responses and stops on terminal/access errors. PDF preparation/download is a single explicit intent over saved content. |
| UI consistency and accessibility | Shared primitives provide empty states, button progress, forms and status details. Tooltips support hover, focus, activation and Escape. Modals preserve list context, restore focus, retain rejected drafts and guard duplicate submissions. Existing roles still control mutation actions. |
| Analytics choices | Strict context-only inputs, existing project/read-rate/plan checks, accepted-origin intersection, bound SQL parameters, approved custom keys, per-field limits and byte limits. Unsafe choices are omitted rather than rewritten. Existing selection and literal empty/all values remain distinct. |
| Browser lifecycle | Choices load only while the relevant filter panel is open. Context changes/closing abort reads and obsolete responses cannot replace the current scope. Invalid/empty/unavailable states disable affected controls and offer an explicit read-only retry where appropriate. |
| Public interfaces | Additive API, CLI and ordinary MCP capability plus OpenAPI/help/contract documentation; restricted agent/OpenAI catalogues remain unchanged. Old endpoints, installed SDKs and package dependencies are untouched. |
| Local preview | Synthetic reports/options use in-memory local-only mocks. Production builds exclude the mock plugin. Mock generation does not buy AI, send email or mutate production. |
| Cleanup and bounds | Shared pools remain in use. Effects remove listeners/timers and invalidate obsolete work. PDF child processes and outputs retain their existing hard limits; synthetic resource checks do not establish hosted capacity. |

## Verification

| Check | Result / local evidence |
| --- | --- |
| Root TypeScript, all 148 changed/new source and test files lint/format | Passed; `static.log`, including 7 release-governance tests. |
| Required PDF render, child and HTML checks with Poppler | 16 tests passed; `pdf.log`. |
| Shared types, CLI, MCP and production dashboard builds | Passed; `candidate-build.log`. Existing large-chunk advisory remains. |
| OpenClaw generated manifest and runtime | Corrected artifact passes 23 targeted distribution/contract tests and native offline checks on Node 22/24/26; `distribution-regressions.log`, `openclaw-runtime.log`. New read remains optional. |
| Public site companion | 72 tests, types and the 145-page static build passed; `site-check.log`. Updated source-generated OpenAPI/reference artifacts and five analytics/MCP guides; no publication. |
| Hosted deployment workflow tests | 33 passed; `hosted-workflows.log`. Companion source unchanged. |
| Dependency advisory policy | Passed at the existing high-severity threshold: 0 high/critical, 39 moderate and 9 low findings; `dependency-audit.log`. Dependencies were not changed. |
| Maximum report/resource check | Passed for 10 projects, 140 metrics, 100 sources and three serial PDF child renders with synthetic concurrent ingestion; `report-resources.log`. No hosted-throughput claim. |
| Combined full unit run | Initial run: 5,990 passed, 581 integration/environment-gated skips and two artifact/doc failures corrected above; `full-unit.log`. All 5,992 unit/interface cases subsequently passed in the combined coverage run. |
| Report/access/migration/analytics-choice database regressions | 200 passed across 24 files; `integration.log`. The additional HTTP/adapter/no-store case passed in the registered coverage lane. |
| CI-equivalent isolated database and changed-file coverage gate | 6,382 passed across 804 files and 132 groups, including 390 database cases; `qualified-coverage.log`, `qualification-summary.json`. All 90 changed source files pass the existing gate, with 19 using its existing changed-line rule. Merged coverage: lines 88.24%, functions 89.87%, statements 86.86%, branches 78.96%. No threshold was changed or waived. |
| Final fix regressions | Root types, scoped lint/format and 25 API/documentation/governance tests pass; `audit-fixes.log`. |

Source size and `git diff --check` are also checked. No changed source reaches the
1,000-line hard limit. The pre-existing CLI metrics test module is close to that
limit and must be split before adding further cases there.

The private site companion is based on
`b9f4ce7304d239ede2b4919948dd0f41e3fcbd69`; seven documentation/generated reference
files changed. Its final build after the cache-policy update also passed
(`site-build-final.log`). Hosted deployment source at
`a813089f9902c1f2f4470f5b0ece5093115f28e6` was reviewed and tested without changes.
The disposable integration services and isolated coverage database were removed
by their owning runners. The final manifests record both core and site source;
no dependency version, lockfile, access rule or production feature flag changed.

## Release conditions, once separately authorised

1. Freeze the reviewed candidate and run the required CI gates against its exact
   commit. Preserve the current feature flags, configured provider, token limits,
   generation allowance and AI budget. Preparing a release is not permission to
   enable a new lane or regenerate existing reports.
2. Apply additive migration `202611090001_add_report_model_diagnostics` using the
   ordered migration runner before the new API or worker starts. Never bootstrap
   an existing database. API and worker startup require the ledger and physical
   diagnostic column/constraint. Existing migration checksums stay unchanged.
3. The hosted image rollout already runs the candidate's `db:migrate` before
   candidate startup, checks readiness with the worker paused and keeps the prior
   compatible release. Self-host Compose requires its migration service to finish
   before dependent services. Leave the nullable column in place on application
   rollback; do not reverse or rewrite receipts.
4. Release the API before dashboard/client capability use. Dashboard option reads
   fail safely if the endpoint is temporarily unavailable. Publish CLI/MCP only
   if those distributions are included in the later release instruction, using
   their normal immutable packaging/version and MCP ecosystem gates.
5. After an authorised deployment, verify the actual deployed revision, migration
   ledger, API/worker readiness, retained-report access and served dashboard assets.
   Observe the next normally scheduled generation or separately authorise a new
   generation for an end-to-end check. Do not silently spend or resend email to
   manufacture acceptance evidence.

Historical factual reports are deliberately unchanged. Their discarded rejection
reason cannot be recovered, and this release does not invent one or retroactively
attach generated prose. Future attempts retain safe diagnostic codes. Monitor
rejection/uncertainty rates separately from readable factual delivery, using the
bounded operator query documented in the reliability audit.

Passing local checks cannot guarantee every future provider response, network or
storage operation succeeds. The reliability contract is bounded work, preserved
facts and receipts, explicit failure states, strict access/privacy checks and
no hidden paid retry. Production acceptance remains a separate evidence layer.
