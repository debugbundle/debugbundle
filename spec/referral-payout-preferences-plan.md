# Creator payout preferences

Approved 16 November 2026, with USD (default), EUR, GBP, CAD and AUD.
DebugBundle only; SayCheese is a read-only pattern reference. Local implementation,
tests and review are authorised. Publication, deployment and transfers are separate.

## Contract and design

- A verified creator saves payment preferences per permanent programme, not per
  workspace or terms revision. Joining/earning does not require setup.
- Shared product defaults supply countries, currencies and IBAN/Wise/Revolut methods;
  no programme-editor controls. Validate recipient name, IBAN checksum or tag.
- Existing Field/Input/Select/Card/Notice primitives render a composable form in
  Settings → Referrals → Payments, alongside payment history. Programme, Earnings
  and Referred clients use the same Tabs primitives as the internal view.
  List prior accepted programmes when needed.
  Keep setup before payment history while any programme needs details; move it
  below history after confirmed saves, including on subsequent visits.
  Show masked summaries; edit fields start empty. Handle loading, validation,
  missing configuration, stale edits, unsupported method/country and failures.
- Encrypt recipient/destination at rest with a dedicated configured server key;
  never place raw details in ordinary reads, logs, telemetry, public DTOs or audit
  metadata. Only payout-authorised operators can explicitly reveal instructions.
- USD remains the accounting currency. Preferred settlement currency is a manual
  request. Transfers and exchange decisions stay outside the product.
- Routine payout descriptions say $50 USD. Smaller balances remain owed, carry
  forward and can be manually settled. This is a routine review policy, not a
  forfeiture or automatic transfer trigger.

## Implementation and compatibility

1. Add shared schemas/policy and validation tests. New API/CLI/ordinary MCP
   operations share one domain service; programme delegation grants no payout rights.
2. Append a forward migration for encrypted current preferences and immutable
   per-batch instruction snapshots. Verify ledger/checksum, readiness, indexes and
   guards. Existing schemas, checksums and historical batch records stay intact.
3. Scope newly prepared versioned-programme payments to one partner/programme.
   Reuse partner/currency locks and financial-admission fencing. Require an exact
   preference revision, freeze instructions atomically, and preserve idempotency,
   holds, negative offsets, uncertain outcomes and prior batches. Legacy-only
   payments keep their existing external-detail workflow. A database entry guard
   prevents older writers from claiming versioned earnings without their snapshot.
   Positive entries come only from the selected programme; all unclaimed negative
   entries remain partner-wide offsets, preserving the existing debt invariant.
4. Add creator preferences and operator programme selection/instruction review.
   Use the existing billing-operator allowlist, not the programme/Analytics gate.
   Preserve prior prepared payments when a creator changes future preferences.
5. Include account export/retention and project-merge table classification. Current
   preferences are personal; financial snapshots follow existing payout retention.
   Automatic approval review rejected automatic deletion of current preferences
   on account anonymisation. That destructive retention step is deferred pending
   explicit owner approval; preserve encrypted records and existing financial
   retention rather than add the rejected deletion trigger.
6. Extend the labelled local simulator and local docs. Use the approved $50 USD routine-review wording in
   public page, terms/guide/announcement and internal contracts/review notes.
7. Qualify validation, ownership/CSRF/operator boundaries, races/stale revisions,
   snapshots, per-programme accounting and legacy compatibility with real isolated
   Postgres migrations plus API/client/component tests. Run types/lint/coverage,
   app/site builds and hosted migration/reader checks where affected.

Maps to FR/AC-REF-01, 02, 07–10 and the existing referral-accounting contract.
No automatic transfer, FX feed, tax onboarding or expanded programme editor.
