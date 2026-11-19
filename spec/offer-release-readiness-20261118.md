# Offer release readiness — 18 November 2026

Historical preparation record. Release was withheld on 18 November; the owner
authorized the production train on 19 November. Follow [the current release
record](release-20261119.md) for selected versions and execution.

The original preparation boundary was local-only:
No commit, push, tag, publication, deployment or production/provider mutation is
part of this preparation. Qualification results are recorded in STATUS.md.

## Scope

This candidate includes anonymous promotion discovery through the shared referral
banner, cheapest eligible invoice selection with referral ties and retained creator
agreements, confirmed checkout without an existing claim, grouped revision history
and archives, native local date/time fields, responsive programme forms, restored
weekly-review numbering, and quiet no-offer discovery failures.

The release review found two checkout defects, now covered by regressions:

- Saved-claim removal/expiry during provider verification must be rechecked under
  the transaction locks before replacement, history or claim-slot changes.
- A definitive rejection before provider admission must allow a fresh quote.
  Billing also refreshes the saved workspace offer, including removal in another
  tab. A new regular-price purchase requires another explicit confirmation.

Uncertain transport or provider-admission outcomes retain the exact confirmation
for reconciliation. Quotes still create no claim or provider session.

## Distribution eligibility

These decisions identify eligible release surfaces; they authorize no publishing
and do not assign versions before the release is requested.

| Surface                                         | Decision | Concrete reason                                                                                                                           |
| ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Core API, worker and app                        | Publish  | Offer discovery, transactional selection, recovery and operator/customer UI behavior changed.                                             |
| Public site                                     | Publish  | Shared offer context, exact per-plan pricing and no-offer banner behavior changed.                                                        |
| CLI and ordinary MCP                            | Publish  | Bundled request schemas accept exact plan/interval context and explicit no-claim discovery; MCP guidance explains purchase confirmation.  |
| OpenClaw companion                              | Publish  | Its bundled ordinary MCP must accompany a selected MCP release.                                                                           |
| SDKs, shared SDK packages, hosted OpenAI plugin | Retain   | No capture, transport, schema or restricted hosted-tool behavior changed.                                                                 |
| Existing editor plugins and portable skill      | Retain   | No installed instructions or required pins changed in this slice; adoption of a new MCP pin is a separately selected distribution change. |

## Ordered release procedure after authorization

1. Commit the reviewed core/site changes and qualify their pinned revisions in CI.
   Select versions only for the eligible distributions being released. Complete
   their exact-artifact/installed-package checks before registry publication.
2. Use the private cloud companion's existing immutable image rollout. Run ordered
   migration `202611180001_reconcile_offer_publication` before new API/worker code.
   Never use bootstrap for this upgrade. The ledger/readiness checks reject a
   missing repair, and code collisions roll back instead of reassigning aliases.
3. Retain the active and previous stable images, preserved settings and financial
   records. Existing saved-offer readers remain the rollback floor. New private
   quote fields need the new reader; an older reader requires a fresh quote from
   the saved claim. Never delete or rotate an admitted payment attempt to recover.
4. Publish the app/site artifacts only with the compatible API available. Verify
   public no-code context, explicit referral context and per-plan pricing against
   the same eligible terms, alongside public readiness and immutable asset bytes.
5. If MCP is published, run the mandatory local ecosystem pipeline after npm
   publication, including registry, Smithery, ClawHub/OpenClaw and discovery checks.

Live migration, registry, deployment and post-deployment checks belong to that
authorized release. Local fixture/provider-adapter tests are not evidence of a
real customer payment, provider canary or owner browser acceptance. Other products
and their installed DebugBundle versions remain outside this task.
