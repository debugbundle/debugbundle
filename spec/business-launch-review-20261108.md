# Business launch review — 8 November 2026

> Follow-up: [approved rounded pricing](pricing-refresh-20261108.md) supersedes
> this record's price amounts and runtime/site artifact identities. Live/test
> Stripe catalogues and next-release price references are now configured; the
> release/activation boundary remains unchanged.

Status: implementation audit complete and locally qualified for owner testing.
The owner-authorised A–J audit, trial/ChatGPT report follow-ups and pricing
refinement are complete. This record supersedes the earlier candidate identity.
No commit, publication, production deployment, provider mutation, real notification
or consumer-product change was performed. Production activation and owner/provider
acceptance remain separate gates below.

## Approved pricing refinement

The owner requested simple core-feature cards, a categorised tier comparison
including extra-unit costs, collapsible FAQs and annual selection by default with
monthly equivalent prices. Reuse the site typography, semantic colour/focus tokens,
spacing, native radio controls, tables and disclosure pattern; no new dependencies
or theme. Cards expose the actual annual charge beside the monthly equivalent.
A reusable comparison component supports grouped headings and secondary allowance
increments; a reusable FAQ component uses keyboard-accessible native details.
Mobile keeps the cards readable and confines comparison overflow to a labelled
scroll region. Verify light/dark, desktop/tablet/mobile, keyboard, billing switching,
FAQ expansion and the exported page in a headless Docker browser as authorised.

The Sentry reference was inspected from its public pricing page in an isolated
headless browser; source text/screenshots are in `.tmp/business-audit/browser/`.
The design follows the information hierarchy, not Sentry branding or product claims.

## Review scope

Audit slices A–J from `spec/local/proposals/business-tier-implementation-plan.md`,
with the later first-eligible-invoice decision and Business-trial/ChatGPT report
extensions in `spec/business-tier.md`. Trace requirements to source, migration,
authority, quota/payment, worker, interface, UI and test evidence. Preserve the
explicit cost/infrastructure and Enterprise exclusions. Source and local tests,
provider acceptance, deployed runtime and owner tests remain distinct evidence.

## Findings resolved

- OAuth scope validation assumed all available scopes were requested. Accept only
  requested allowlisted scopes, preserve old six-scope connections, permit explicit
  report consent, reject duplicate/unknown scopes and preserve identity checks.
- Public prices and limits were separately authored. Generate the standalone
  website snapshot from the backend catalogue and capabilities; verify parity.

- Reviewer OAuth consent granted the entire current catalogue regardless of the
  requested scopes. Both domain and provider grants now use only the requested,
  explicitly accepted scopes; old connections retain their original catalogue.
- Numeric lifecycle/availability triggers could continue collection after trial
  expiry before cleanup. A new forward migration applies the database deadline and
  restarts coverage on late paid conversion. Readiness detects missing/disabled guards.
- Self-hosted Free collection/health recovery and new organisation/report UI gates
  still used the paid tier name. Self-host entitlements now apply consistently;
  inherited access still requires explicit authority and denies suspended principals.
  Legacy tokens cannot gain inherited access. A separate forward role-function
  migration and optional server-owned session hint preserve hosted behaviour.
- Visual inspection caught the highlighted pricing CTA inheriting the site link
  colour. It now uses the existing accent-foreground override pattern.
- Public billing/API/workflow guides still described only Solo/Team trials. They now
  include Business, the unchanged seven-day purchase wait and the single trial
  report window. Referral copy consistently promises the first eligible invoice.
- The mobile organisation invitation sheet clipped the future-project choice.
  Existing Sheet and wrapping ToggleGroup primitives now keep all options visible.
  Report settings use plain language and server-reported allowances; self-hosted
  screens no longer claim hosted fixed limits. Annual subscription changes keep
  the full yearly charge visible.

## Plan and failure-boundary reconciliation

| Slice / acceptance | Reviewed implementation and evidence                                                                                                                                                                                                                                                                                                                                           | Remaining boundary                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A / AC-BUS-01–10   | Central `spec/business-tier.md`, public interfaces, auth/security and report contracts; original monthly and 23-tool OpenAI fixtures; generated pricing catalogue parity. Later owner decisions explicitly supersede first-successful-payment and no-Business-trial proposals.                                                                                                 | Historical production/portal receipts remain historical.                                                                                         |
| B / AC-BUS-01,08   | Shared billing catalogue and tier capabilities, anchored monthly allowance windows, 0–99 matching-interval capacity and deterministic health limits. Catalogue/offer/window tests preserve Free/Solo and conservative analytics. Public prices now use the same catalogue.                                                                                                     | Broader full-exhaustion infrastructure economics remain owner-deferred; no new resource architecture.                                            |
| C / AC-BUS-03      | Auth action policy, scoped principal, SQL actor role, frozen origins, SDK/member-token separation and queued authority fences. `organization-project-access`, report authorization/content and legacy API/MCP tests exercise denial, revocation, suspension and merge boundaries. Self-host inheritance requires the same explicit authority; legacy tokens do not acquire it. | No additional SDK runtime change in this follow-up audit. Initial credential-redaction candidate evidence remains in the original qualification. |
| D / AC-BUS-02      | Organisation invitation/admission/management/ownership stores and shared API/CLI/MCP clients. Real transactions exercise unique-person reservations, delegation and accepted transfer; browser fixtures verify People/invitation layout and workspace controls. Server-owned self-host entitlement repairs the previous gate mismatch.                                         | No paid seat model, custom roles, speculative grandfathering or account reassignment.                                                            |
| E / AC-BUS-01,09   | Full-offer reservation, quotes, paid/pending application, schedule and recovery paths. Checkout/webhook real-database suites plus provider-adapter tests cover retries, stale state and entitlement fencing. Business trial admission, signup, email, CLI/MCP and browser tests preserve one trial and seven full days.                                                        | Stripe-backed test purchases/catalogue setup are separate from fake-provider and database proof.                                                 |
| F / AC-BUS-04      | Referral attribution/benefit/receipt reconciliation/immutable ledger and finance paths. Tests cover Business-only exclusions, first eligible base invoice, collected cash, anniversary allocation, rounding, reversals, uncertainty and competing manual payout claims. UI wording matches that invoice promise.                                                               | No real coupon, attribution, transfer, external payout or provider mutation performed.                                                           |
| G / AC-BUS-05      | Lifecycle, availability, health, analytics, source-text and coverage stores; explicit retention/deletion/export. New deadline trigger tests prevent post-trial history, restart coverage on late conversion and preserve opted-in self-host collection. Existing resolution/regression, old unresolved issues and honest coverage tests pass.                                  | No invented historical completeness or inferred incident resolution.                                                                             |
| H / AC-BUS-06      | Report definition/admission/scheduler/execution and model projection/cost modules. Fair fenced claims, one paid attempt, shared allowance/budget, cancellation and current creator authority retain resource-isolation tests. Trial has one 30-day 40-run window.                                                                                                              | Terra remains the previously evaluated model; no additional paid evaluation or model call in this audit.                                         |
| I / AC-BUS-06,10   | Canonical private HTML/PDF/email with report client/UI and receipt-backed delivery. Report/content/PDF/email tests preserve whole-origin authorization, bounded rendering, uncertain-send handling and no regeneration on download. Explicit OAuth report reads expose saved content only, with schema/redaction/512-KiB bounds and live consent rechecks.                     | Synthetic browser evidence does not establish real inbox delivery or ChatGPT portal acceptance.                                                  |
| J / AC-BUS-07,08   | Full unit/database coverage, full integration, types/lint, site export, headless review, migration/readiness and private cloud rollback tests. Source-only local runtime snapshot and exact artifact archives are retained below.                                                                                                                                              | Owner acceptance and separately authorised release/provider activation remain open.                                                              |

The review used the pre-ship checklist for each boundary: bad inputs and live
permission loss, conflicting operations and replay, uncertain external results,
connection/child-process cleanup, source-of-truth alignment, schema readiness and
migration-before-code ordering. No customer/support compatibility framework,
Enterprise custom-limit engine, new infrastructure or consumer-product adoption
was added. The annual discount, extra-unit prices, conservative analytics, people
and health limits, Terra budget and Business-only referral policy are unchanged.

The final coverage review added seven focused report-control/capture-policy cases.
An unreachable capture-policy fallback was removed: every supported preset already
uses either the empty or recommended status set handled by the earlier branches.
Explicit null, none, recommended and custom overrides retain their behaviour.
The oversized CLI routing test was split at the notification/integration boundary;
all 25 original cases and assertions remain, in files below 800 lines.

## Fresh qualification evidence

Receipts are under `.tmp/business-audit/`. The initial qualification record is
retained as the earlier candidate; these follow-up results supersede its source
identity and migration count.

- Core coverage: all 128 groups have passing results, 6,134 checks, plus 32 fresh
  focused UI checks (including seven new cases). The unchanged 80% changed-source
  policy passes for all 423 changed files. Final totals: 87.99% lines, 86.60%
  statements, 89.51% functions and 78.43% branches (`coverage-qualified.log`).
  The first run overlapped a transient duplicate import; all twelve API groups
  and three affected web groups were rerun successfully. Three UI source entries
  use only fresh final-source maps instead of merging obsolete locations.
- Full root lint passes (`full-lint-final.log`), with later edits separately
  type/lint/style checked (`final-source-qualified.log`, `cli-split-qualified.log`).
  Root TypeScript uses the established 4-GB Make target; a 2-GB helper exhausted
  its heap. No lint, type, coverage threshold or assertion was relaxed.
- Full integration: 85 files, 559 passed and one optional installed-browser test
  skipped (`full-integration.log`). The installed-SDK lane then passed both tests
  with the built Browser SDK supplied (`installed-sdk-runtime.log`).
- Targeted safety regressions: report trial/collection/health 27 checks; self-host
  unit/access 62; self-host HTTP/trial 14; dashboard polish 27.
- Site: 48 tests, TypeScript, 145-route static export and 404 verification pass
  (`site-docs-final-build.log`). The existing webpack dependency-cache warning and
  dashboard bundle-size advisory remain build warnings, not failed checks.
- ChatGPT plugin: local 1.1.0 archives prepare/verify; all 38 package/contract checks
  pass (`openai-final-qualified.log`). The heavy generated-artifact import was
  moved to normal test setup after two cold-import timeouts; assertions and the
  test timeout are unchanged. Pinned MCP Inspector strict catalogue checks pass.
- Private cloud: 45 deployment/image/context/rollback checks pass. Runtime requires
  `business-tier-v2`, including all three follow-up migrations; older v1 candidates
  cannot qualify as the retained rollback for activation.
- Local runtime: the new source-only image builds with the frozen lockfile and
  passes offline bundled PDF font integrity checks (`runtime-qualified.log`,
  `runtime-fonts-qualified.log`). No registry login, push or deployment occurred.

### Visual and local acceptance

The public page was reviewed in an isolated Docker headless browser at 1440, 768
and 390 pixels, in light/dark themes. Annual default/monthly switching, radio-key
navigation, FAQ keyboard expansion, CTA contrast and no document overflow pass.
The comparison table alone scrolls horizontally; category and feature labels stay
visible when reading Business on mobile. Final screenshots and machine checks are
in `browser/pricing-checks.json` and `browser/pricing-*.png`.

Dashboard screenshots and interactions use synthetic fixtures and block unrelated
network requests. Desktop/mobile People, invitations, Reports/list/settings/detail,
Referrals and paid annual Billing pass without unexpected API calls or page errors.
The full-width mobile invitation choices and yearly change dialog were visually
inspected after correction. See `browser/dashboard-checks.json` and screenshots.
No email, purchase or account-plan mutation is made by these browser checks.

The retained local development database was backed up before applying only the
three new forward migrations: 83 already applied, 3 applied, 86 total. A direct
comparison of protected COPY rows against that backup confirms users,
organisations, projects and member/project tokens are unchanged
(`local-protected-verified.json`). The preliminary text fingerprints used different
row serialisations and were not used as preservation proof. Local API/worker were
restarted after migration; `/ready` returns ready. No bootstrap/reset was used.
The docs, pricing, report, referral and billing pages at port 5292 match the final
export byte for byte (`local-preview-readback.json`). Local account tier and
sales/AI/email activation settings were not changed.

## Final candidate identity

The work remains uncommitted, based on `e113414540aa00ebbbac12ea0783ee0c16eacbaf`; that
commit alone does not contain the implementation.

- Runtime source SHA-256: `111d78eab8cbb638cc7aab78d055d85457fb79a2a830985fb33d230902101a5e`.
- Local image ID: `sha256:b52942e67ad73e69361c3d687731c87f8e2aefa07977ab48bbc36b36438e118b`.
- Labels: `business-tier-v2`, `project-services-v1`, `postgres-v1`.
- Exact CLI/MCP/OpenClaw/dashboard/site and OpenAI candidate hashes:
  `.tmp/business-audit/final-artifacts/manifest.json`.
- Source inventory: `.tmp/business-runtime-candidate-before-pricing/runtime-source-manifest.json`;
  all included file hashes match the final workspace. Earlier candidate contexts
  are retained separately. The source context excludes credentials, operator files,
  Git metadata and other products.

The CLI/MCP/OpenClaw archives retain existing package-version metadata for local
qualification only. Their later publication requires selected new versions and
fresh published-artifact acceptance. OpenAI candidate 1.1.0 is prepared/verified
locally; no existing portal draft or connected application was modified.

## Release boundary

This is a local implementation/review candidate, not a production release. After
owner testing, release still requires explicit authority, versioned exact-artifact
publication where applicable, configured Stripe prices/coupon and provider test
journeys, a DebugBundle-owned report API key, migration-first deployment with a
compatible active/retained rollback pair, live resource/headroom checks, and
controlled activation. The new ChatGPT scope/tools require fresh connection
consent, portal rescan and reviewer acceptance; the prior 23-tool portal receipt
cannot qualify them. The established report budget and generation/email/sales
switches remain enforced and default off.
