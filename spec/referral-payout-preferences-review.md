# Creator payment preferences — local review

Approved scope and design: [implementation plan](referral-payout-preferences-plan.md).
Maps to FR/AC-REF-11 and preserved FR/AC-REF-01, 02, 07–10.
Core, site and hosted source remain uncommitted on `feature/referral-programmes`.
No deployment, activation, live provider operation or transfer occurred.

## Review links

- [Creator setup](http://localhost:5291/settings/referrals): accept the local
  programme in Programme, then open Payments to choose IBAN/Wise/Revolut,
  recipient country and currency. Earnings and Referred clients have separate tabs.
  USD is the default; EUR, GBP, CAD and AUD are also available.
- [Payout operator view](http://localhost:5291/settings/referrals/payouts): separate
  billing-operator permission applies. The ordinary local preview has no payment
  authority or synthetic earned balance; real finance behaviour is tested with
  isolated Postgres fixtures, not live transfers.
- [Programme management](http://localhost:5291/programmes): no new country,
  currency or payout controls; these are shared product defaults.
- [Public offer preview](http://localhost:5292/pricing/?offer=REVIEW20): persistent
  compact banner, shared blue View details link/arrow on all screen sizes,
  conditions in the existing shared modal with its own close control.
- [Public referral page](http://localhost:5292/referrals/),
  [terms](http://localhost:5292/terms/#referrals) and
  [guide](http://localhost:5292/docs/referrals/): routine review starts at US$50;
  smaller balances remain owed and carry forward, with manual arrangements possible.

The private app preview is a labelled in-memory simulator. Enter only synthetic
recipient details there; saved preview state is masked and reset on restart.
Its programme edits do not populate the separate public offer API fixture.

## Failure and trust-boundary audit

- Setup requires verified personal ownership and an accepted programme, exact
  user context and last-read revision. Concurrent edits cannot overwrite silently.
  Joining and earning do not depend on payment setup.
- Recipient fields are encrypted with a dedicated key and bound to partner,
  programme and revision. Ordinary reads and exports are masked. API and app
  telemetry redact payment fields even in failed request bodies. Audit metadata
  excludes raw names, tags, IBANs and ciphertext.
- Preparation selects one programme's positive credits and all partner-wide
  negative offsets. Existing dispute/reconciliation holds, availability, partner
  lock, financial admission fence and one active USD batch remain enforced.
- Exact instructions are frozen atomically with entry claims. Missing, stale,
  corrupt or wrongly encrypted preferences roll back preparation. A new reader
  cannot reinterpret edits as changes to an existing batch. Unknown batches fail
  closed; legacy batches retain their externally agreed details.
- Same-UUID retries remain idempotent. Different programme/revision reuse fails;
  uncertain payments remain reserved until manually reconciled. No transfer or FX
  service is called. Preferred settlement currency does not alter USD accounting.
- Additive migration `202611160002_add_referral_payout_preferences` precedes
  consumers. Runtime readiness rejects absent/disabled guards and missing shapes.
  Old writers cannot insert versioned positive entries without a matching snapshot.
  Existing records/checksums and legacy payment flows are preserved.
- API, CLI, ordinary MCP and optional OpenClaw metadata agree. Payout authority is
  separate from programme delegation and workspace roles. Restricted OpenAI tools
  gain no new finance capability.

## Verification record

Initial focused finance checks passed 31 tests including the existing ledger.
API/client/creator/payout UI checks passed 34 tests; additional form/privacy states
passed four component tests. Public site tests passed 114 tests and typecheck.
Hosted configuration tests passed 53 tests. Local shared, CLI, MCP, app and public
site builds passed. Source/HTTP checks confirm the public offer API and private
preview policy routes; no browser/device or external payment acceptance is claimed.

The first broad instrumented run hit Docker DNS (`EAI_AGAIN postgres`) and database
setup hook timeouts, followed by missing-schema failures. Its failed results are
retained in `.tmp/payout-preferences-qualification.log`; no acceptance claim relies
on that run. The fresh broad run passed **425 tests across 51 files**. Final-source remeasurement
passed **22 tests across six files**; the shared signup/Billing client checks passed
**19 tests across three files**. Automation/OpenClaw/restricted-release contract
checks passed **26 tests across five files** using the git-capable tool container.
Core typecheck, ESLint and formatting checks passed. The changed-file coverage gate
passed **124 changed source files**, including 10 existing larger files qualified by
changed-line coverage. New payment storage/schema/domain/client files measured
100% line/function coverage; the API routes measured 95% lines/100% functions and
creator form 98.71% lines/96.29% functions. These are actual V8 measurements;
unchanged prior maps are retained only after source-hash verification.

Evidence: `.tmp/payout-preferences-qualification-final.log`,
`.tmp/payout-preferences-final-source.log`,
`.tmp/payout-preferences-client-coverage.log`,
`.tmp/payout-preferences-automation-green.log`,
`.tmp/payout-preferences-coverage-provenance.json`,
`.tmp/payout-preferences-coverage-gate.log`,
`.tmp/payout-preferences-eslint-green.log`,
`.tmp/payout-preferences-format-green.log`,
`.tmp/payout-preferences-build.log`,
`.tmp/payout-preferences-web-final-build.log`,
`.tmp/payout-preferences-public-build.log` and
`.tmp/payout-preferences-http-review.json`. Eight local routes returned HTTP 200;
exported banner source retains modal close and has no banner-dismiss control.

## Retention decision still requiring explicit approval

Automatic approval review rejected a proposed destructive trigger deleting current
payment preferences when an account is anonymised. No such trigger or cascade was
applied. Current encrypted preferences remain retained and lose their live account
link; recreated accounts cannot read them. Frozen financial instructions remain
immutable. The current privacy copy describes that behaviour. Deleting current
preferences on anonymisation requires a separate explicit owner decision; preserve
historical financial snapshots either way.

## Release boundary

This is local internal-review qualification. Configure and securely retain a
dedicated `REFERRAL_PAYOUT_ENCRYPTION_KEY` before enabling real setup; absent keys
disable setup/preparation. A malformed configured key is rejected. Rotation needs
a separate encrypted data migration. No real key was configured in this work.
Use the normal migration-before-runtime deployment path and preserve the additive
tables/financial guards on rollback. Publication, deployment, real campaigns,
recipient verification, settlement agreement and transfers remain separate owner
actions. No SDK/package version bump or publication is needed for this local review.
