# Release qualification audit — 19 November 2026

Status: local release qualification passed, with no remaining blocking findings
in the reviewed scope. This record captures the pre-publication source snapshot.
Subsequent authorization, registry and hosted receipts are recorded in
[the core 1.30.0/site 1.11.2 release](release-1.30.0.md).

## Reviewed scope

- FR-WEB-09 and table acceptance: workspace/project Incident and Improvement
  selection, shared shadcn checkboxes, conditional bulk actions and header control.
- FR-BUS-02 / organisation-management contract: People avatars, optional metadata,
  protected image reads and API/CLI/MCP compatibility.
- FR/AC-REF-01/04: atomic promotional draft/code creation, code validation,
  inventory filtering, saved-code presentation and retained legacy operations.
- AC-DOC-14: public-site skip-link visibility and keyboard focus transfer, with
  and without a promotional banner.
- Other pending DebugBundle site changes: homepage link prefetch, local testimonial
  WebP masks, generated reference artifacts and hosted manifest cache metadata.
  The existing cloud workflow edits were reviewed and tested without modification.

## Findings addressed

1. The shared table primitive removed right padding whenever a cell contained
   `role="checkbox"`. Native inputs did not trigger that selector, while the new
   Radix controls did. Removed the override and shared the selection-column
   dimensions across all three table renderers. The leading inset balances the
   trailing inset plus the next text cell's padding; block centering removes the
   inline baseline offset. Header and body use the same geometry.
2. Saved-code state in a mounted programme control was not refreshed when its
   lifecycle state changed. Added a state-dependent read and a regression for an
   older draft receiving its generated code. Empty ended revisions no longer
   promise activation. The new regression failed before the correction and passes
   afterwards. The current full-page reload also remounts these controls.
3. A migration integration assertion still expected every migration to be covered
   by the bootstrap snapshot. The established contract deliberately adds offers,
   payout preferences, creator notifications and publication repair through
   ordered forward migrations. Corrected the outdated test after checking the
   bootstrap source and migration policy, and verified that readiness fails before
   migration, the four exact migrations run, and a second run applies nothing.
   No production migration, checksum or bootstrap implementation was changed.
4. Expanded avatar regression coverage for anonymous access, legacy Admin tokens,
   wrong-organisation credentials, malformed IDs, missing metadata and unavailable
   stored images. Failed image reads return a safe response before initials fallback.
5. Hiding a bulk toolbar could remove its focused action button. Both desktop and
   mobile toolbars now return focus to their persistent inventory heading when
   removed while owning focus. Clearing a row or changing a filter keeps the
   user's current focus. Both new keyboard regressions failed before the fix and
   pass afterwards; the full dashboard suite is rerun against the final source.

## Compatibility and failure review

- Default People responses retain their previous fields. Only opted-in clients
  receive `avatar_url`; object keys never appear in public responses. The image
  reader repeats current organisation authority and exact-person checks. Existing
  avatar storage is reused; images are privately cached for five minutes.
- Draft `promotion_code` remains optional for installed automation. Existing
  reservation operations and activation-generated fallback remain available.
  Creator namespace restrictions are unchanged. Unique-registry conflicts roll
  back the complete draft transaction, including concurrent creation attempts.
- Promotion terms, provider bindings, existing claims and financial promises keep
  their existing contracts. The custom public code maps to the recorded offer;
  saving a draft creates no provider discount, active campaign or customer claim.
- Selection stays scoped to visible rows; sorting, pagination, bulk mutations and
  row navigation retain their existing behavior. Keyboard clearing returns focus
  to a remaining row control before the header checkbox disappears; a disappearing
  focused action toolbar returns focus to the inventory heading.
- The skip link remains available to keyboard users, transfers focus to main
  content and is hidden during ordinary browsing independently of banner height.
- No dependency, schema, credential, infrastructure or SDK behavior changes are
  introduced by these corrections.

## Qualification evidence

Logs are retained under `.tmp/release-audit-20261119/`.

| Check                                                                      | Result                                                                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full `make test-unit` with coverage and isolated database                  | Passed: 146 shards, 895 files, 7,317 tests; five environment-dependent cases separately selected                                                    |
| Final changed-file coverage after fresh dashboard measurement              | Passed for all 33 changed source files; three existing files qualify through the established changed-line policy                                    |
| Full `make lint`, typecheck and candidate build                            | Passed; typecheck, changed-file lint/format and build repeated after the final focus fix. Final selection layout tokens are present in compiled CSS |
| Full service integration suite with Postgres, Redis and LocalStack         | 40 files; 183 passed, one optional SDK case separately selected                                                                                     |
| Retained installed Browser SDK HTTP/database flow check                    | Both cases passed against installed Browser SDK 3.2.4; closes the optional case skipped by the default integration invocation                       |
| Additional offer/referral/organisation database audit                      | 17 functional files passed; migration case subsequently qualified with its required object-store harness                                            |
| Isolated public-site tests, build and typecheck                            | 131 tests passed; 153 pages exported                                                                                                                |
| Automated skip-link checks against that export                             | 64 cases passed in Chromium and WebKit, mobile/desktop, both themes, enlarged text and both banner states                                           |
| Hosted site/deploy source checks                                           | 17 Node tests and 61 Python tests passed                                                                                                            |
| Core/site dependency audit at the production high-severity gate            | Passed; zero high/critical findings. Core retains 11 low/44 moderate; site retains two moderate findings                                            |
| Expanded avatar boundaries and focused UI corrections                      | Passed                                                                                                                                              |
| Complete dashboard suite after final focus correction, with fresh coverage | 162 files; 1,153 passed, one timezone-specific case separately selected                                                                             |
| `make offer-local-time-test` in Europe/Ljubljana                           | 13 passed, including the DST case skipped by UTC containers                                                                                         |
| Dedicated PDF checks with required inspection tools                        | 18 passed; covers all four cases skipped by the standard unit container                                                                             |
| Formatting of every changed core source/test file                          | Passed                                                                                                                                              |
| Core, site and cloud whitespace checks                                     | Passed                                                                                                                                              |
| Disposable audit service cleanup                                           | Verified: no owned audit containers or private test networks remain                                                                                 |

The first migration audit invocation used the database-only referral harness;
its object-store-dependent case timed out. It was rerun with the normal isolated
service stack, where only the outdated bootstrap assertion reproduced. The
corrected migration suite then passed as part of the full service run.

The final keyboard-focus correction landed after the original dashboard shards
had executed. The complete dashboard suite was rerun with V8 coverage. After
checking SHA-256 source hashes, only the five changed files' measured coverage
maps were replaced with those fresh measurements; all other full-suite coverage
was retained. The normal changed-file gate passed again, without altering measured
coverage counters or thresholds. The source/data hashes and exact replaced paths
are recorded in `coverage-refresh-receipt.json` under the evidence directory.
Final aggregate coverage is 89.04% lines, 90.97% functions, 79.89% branches and
87.62% statements.

### Subsequent spacing refinement

After the full audit, the selection column was tightened from `w-10 pl-4 pr-2`
to `w-8 pl-3 pr-1` at the user's request. At the default text size this reduces
the column by 8px, moves each checkbox 4px left and leaves 12px of visible space
on either side, counting the next cell's inset. All header and row controls
continue to share the same geometry. The 14 existing selection/interaction tests,
typecheck, focused lint/format and candidate build passed again; compiled CSS
contains the new layout tokens.
The full-suite coverage receipt above describes the preceding audit snapshot;
`spacing-refinement-source.json` records this styling refinement separately.

## Release boundary

The pending changes introduce no new database shape. Normal deployment must still
run the existing ordered migrations and readiness checks. Deploy the compatible
API before serving the new dashboard or using new optional client inputs: the new
creation form sends `promotion_code`, and saved-code reads use `version_id`.
The existing full-stack workflow already rolls out the runtime before publishing
SPA assets. A later rollback to the older API must restore matching dashboard
assets as well; old draft parsers reject the new optional input. Stored offers,
codes and claims retain their existing readable shapes.

Source and local runtime qualification do not establish deployed-artifact or
provider acceptance. After an explicitly authorized release, verify the exact
runtime/asset versions, readiness, public context, skip-link behavior and manifest
headers/cache delivery. Real payment, mail and production campaign canaries were
not performed in this audit. Preserve the existing rollback release and immutable
assets through the repository-owned release process.
