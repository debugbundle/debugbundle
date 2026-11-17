# Creator programme email notifications — local review

Date: 17 November 2026. Implemented and qualified locally for internal review.
FR/AC-REF-12 records the owner-approved behaviour. No live mail or provider action
has been performed. The owner explicitly selected new customers' first paid
purchases for the daily digest, excluding renewals/repeat payments.

## Behaviour and module inventory

- `offer-creator-store.ts` queues confirmation of each accepted immutable revision
  in the enrolment transaction. Repeating the same acceptance creates no second
  email. Existing API, CLI and MCP join operations all use this store.
- `referral-receipt-processor.ts` captures the first qualifying paid-customer event
  only in its final verified, lease-fenced settlement transaction. The notification
  never initiates payment or adjusts money. `creator-email-events.ts` requires the
  original enrolled referral version and the ledger's eligible commission period.
  It excludes trial/zero, fully refunded-before-confirmation, disputed/held,
  ineligible and pre-rollout first purchases. An attribution creates one event;
  later receipts and renewals cannot create another.
- The first event in a permanent programme queues one celebration. Programme
  revisions and switching preferred programmes do not reset that marker. Later
  customers enter one daily UTC digest per creator with programme sections.
  The first event is not repeated in that digest.
- `creator-email-schema.ts` adds migration `202611170001_add_creator_referral_emails`
  for activation/window state, minimal conversion receipts and a personal outbox.
  Schema/ledger readiness fails closed for missing structures and required guards.
  Bootstrap is not used to upgrade installed databases. Project consolidation
  explicitly retains the new account-level records.
- `creator-email-store.ts` seals UTC [00:00,00:00) windows with an exclusive epoch
  lock; writers take a shared lock before user/financial locks. Uncommitted events
  cannot fall between windows. A batch selects at most 50 creators, assigns events
  and freezes message snapshots atomically, with a ten-second statement timeout
  and one-second lock timeout. The window advances only after its selected activity
  is assigned. Quiet windows enqueue no message. Windows represent newly verified
  first purchases, so delayed receipts appear once confirmed.
- Digests contain at most 25 named sections and explicitly identify any further
  programmes included in exact overall totals, keeping messages bounded. Pending
  amounts are snapshots at confirmation, never cleared or guaranteed balances.
  Daily mail expires 24 hours after its window, and dispatch rechecks that a
  covered referral remains inside the last 24 hours. Other queued mail expires
  after seven days. Obsolete mail is skipped; accounting and the milestone stay retained.
- `creator-email-delivery.ts` commits an exact-attempt send fence before transport.
  Its personal recipient check uses the original creator's current verified
  account and partner link, never the organization billing contact. Claimed work
  may be reclaimed before sending. Explicit rejection can retry up to five times;
  uncertain acceptance, send timeout or lost persistence after acceptance never
  triggers automatic resend. Stale attempts cannot change a later delivery.
- `worker/creator-email-processor.ts` uses the existing acknowledged SES transport
  with no SDK retries, configured from existing sender/region/timeout settings.
  Missing configuration disables dispatch. Scheduling failure cannot starve
  existing queued mail. Attention logs contain only an opaque delivery ID and
  fixed state; no address or body is logged.
- `email/creator-referral-emails.ts` reuses the existing HTML/plain-text layout.
  All three emails use the shared Referrals eyebrow. Activity windows remain
  internal scheduling/validation data and are omitted from the email body.
  Strict shared schemas check totals, dates and sections; names are escaped,
  subject controls removed and CTA origins validated. Three lazy previews live in
  the existing system-email review catalogue. The private account export adds
  bounded delivery metadata without payloads, provider IDs or customer identifiers.

## Qualification

The broad database run passed 191 tests in 19 files, covering new notifications,
existing offer purchase/settlement/recovery, referral ledger/payouts and project
consolidation. The broad unit/runtime regression passed 418 tests in 44 files.
The final focused database/template run passes 25 tests in two files; the final
worker/runtime/projection run passes 96 tests in seven files, including actual
worker-loop delivery with new enrolment disabled. All eight new runtime modules
exceed 80% statements/lines/functions coverage; templates, previews, send
orchestration, schema and worker composition have 100% in those metrics.
These are independent overlapping gates, not a unique test count.

Local receipts: `.tmp/creator-email-integration-final.log`,
`.tmp/creator-email-regression-final.log`, `.tmp/creator-email-check-final.log`,
`.tmp/creator-email-focused-final.log`, `.tmp/creator-email-coverage-unit.log`
and `.tmp/creator-email-rollout-tests.log`.

Final receipts supersede the earlier focused measurements where appropriate:

| Gate                                   | Result and receipt                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final email/quiet-day cases            | 25 pass; `.tmp/creator-email-qualified-final.log`                                                                                                                           |
| Final worker/readiness/reference cases | 96 pass; `.tmp/creator-email-runtime-qualified.log`                                                                                                                         |
| Coverage/source identities             | Eight new modules pass the 80% statements/lines/functions floor, measured in the final focused and runtime shards; `.tmp/creator-email-provenance.json`                     |
| Types/lint/format                      | All 24 touched source/test files pass, with a final repository typecheck; `.tmp/creator-email-qualified-check.log`, `.tmp/creator-email-runtime-check.log`                  |
| Core local candidate                   | CLI, MCP and dashboard rebuild pass; existing large-chunk warning remains; `.tmp/creator-email-build-final.log`                                                             |
| Independent public site                | 121 checks, export/preview refresh and subsequent types pass; `.tmp/creator-email-site-tests.log`, `.tmp/creator-email-site-build.log`, `.tmp/creator-email-guide-final-build.log`, `.tmp/creator-email-site-types.log` |
| Hosted workflow fixtures               | 53 local tests pass; `.tmp/creator-email-rollout-tests.log`                                                                                                                 |
| Unpublished API/worker image           | Imports/migration/contract labels pass; `.tmp/creator-email-image-final.log`                                                                                                |
| Local HTTP                             | Three preview IDs served; local review, affiliate page and updated guide return 200; `.tmp/creator-email-http.json`                                                         |

The final image is
`sha256:c0163b83d7722535575c79eb16a47efb91626c5806ee95d486579161f801f07b`.
Its 1,495-source manifest is
`2076786c5f490c9edba1fe79540e248ee57154fcdf4db7416604a4e39f674a99`.
Every source still matches the snapshot. Coverage receipts retain their genuine
measurement sources and source hashes; no global counters/thresholds were changed.
Owned temporary database containers/networks were removed by their harness.

Review the three new templates in the local development catalogue at
`http://localhost:5291/__dev/system-emails`. Merely opening it sends no mail.

A delayed-digest regression reproduced a quiet-day send before the final
activity check was added. Both fresh delivery and stale suppression now pass.
The expanded HTML test reproduced missing earnings values before the shared
key-value API usage was fixed. Runtime fixture failures distinguished boolean
readiness probes from table inventories and updated expected migration calls;
production readiness guards and test thresholds were not relaxed.

## Deployment and review boundary

Run the additive migration before starting new API/worker readers. Enable new
programme claims only after both candidates are ready, as required by the existing
rollout contract. Keep schema and minimal dedupe records on rollback. The prepared
image validates the email module/migration and advertises
`com.debugbundle.creator-email-contract=creator-referral-emails-v1`.

No dependency change, commit, push, publication, deployment, actual email, charge,
transfer or consumer-product mutation is included. Real SES acceptance, sender
configuration and production rollout remain separate evidence. Never blindly
resend an uncertain delivery: reconcile its exact provider receipt first under
explicit operator authority. The live financial ledger remains the balance
authority regardless of email state.
