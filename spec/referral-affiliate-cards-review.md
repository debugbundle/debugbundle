# Public affiliate cards — local review, 17 November 2026

The owner approved the SayCheese-inspired public card structure, adapted to the
existing DebugBundle theme, shared buttons and accessible `SiteDialog`. SayCheese
was inspected read-only. No other product was changed.

FR/AC-REF-09 now names `/affiliates/` as the public programme page. The owner
confirmed that the former marketing route was unpublished, so it has no redirect
or compatibility alias. The footer order is About, Affiliates, Contact, Privacy,
Terms, following X. Creator account settings and public API names remain Referrals.

## Signed-in discovery and generic terms follow-up

`ReferralProgrammeCard` reuses the app Card, Dialog, Button and Separator for
available programmes and the creator's current accepted agreement. Each card shows
its own commission, customer discount, eligible plans/intervals and duration.
The current agreement remains distinct from new choices; consent stays outside
the modal and opening/closing terms does not accept it. Code reservation, errors,
pending actions, identity reset and the existing finance tabs retain their owners.
Long action labels can wrap inside their card instead of overflowing narrow views.

`programmeEarningsExamples` now supplies both the public site and app from the
canonical browser-safe policy. It uses the existing invoice arithmetic and each
frontend's existing catalogue, without changing settlement or stored terms.
The app's policy table also leaves shorter annual commissions date-dependent
instead of quoting the full-year amount. Main terms, public guides and the held
blog draft use generic commercial wording; exact values remain in each programme.
Legacy financial rates and accepted obligations are unchanged. The affiliate
heading explicitly breaks before “Get rewarded.”.

The new assertions first reproduced missing app summaries/modals, the one-month
annual example, and the heading/generic wording. Final validation passes:

- 42 tests in seven core files, covering creator consent/code flow, saved versus
  new rates, editor precision, admin/payout views, policy and site projection.
  Receipt: `.tmp/referral-cards-final-tests.log`.
- Measured statements/lines/functions coverage is 100% for the new card and
  policy-details component; the existing control and canonical policy also exceed
  80% in those metrics. Source reports: `.tmp/referral-cards-coverage/`.
- Repository types and focused lint/format pass, as does the CLI/MCP/dashboard
  rebuild. The existing dashboard chunk-size warning remains.
  Receipts: `.tmp/referral-cards-final-check.log`, `.tmp/referral-cards-core-build.log`.
- All 122 site checks, static export/remount and subsequent site types pass.
  Receipts: `.tmp/referral-cards-site-final-tests.log`,
  `.tmp/referral-cards-site-build.log`, `.tmp/referral-cards-site-types.log`.
- Local HTTP checks confirm the explicit heading break, generic referral terms
  and current private-app source. Receipt: `.tmp/referral-cards-http.json`.

Pre-ship review covered exact-version consent, escaping, keyboard close/focus
return, independent current/available policies, narrow layouts, date-dependent
examples and retained loading/error/pending paths. No new API, provider operation,
financial calculation or schema change is introduced. These are local source,
test, build and HTTP checks; browser/owner and provider acceptance remain separate.

Local-link follow-up: the app's programme modal and preserved legacy enrolment
now use `resolveReferralTermsUrl`, following the existing Docs/Pricing site
resolution. Local review opens `http://localhost:5292/terms/#referrals`, production
uses the hosted site, and an explicit documentation origin stays respected.
The hard-coded hosted link was reproduced before correction. All 41 related app,
link and pricing checks pass (`.tmp/referral-terms-link-tests.log`); the active
Vite source and generic local terms HTML were checked. The live site is unchanged.

## Implementation and failure review

- `PublicProgrammes` retains the validated public API read, cancellation, retry,
  loading/empty states and referral-kind filter. A responsive one/two/three-column
  grid composes reusable `PublicProgrammeCard` instances; one programme occupies
  one card column rather than stretching across the desktop page.
- Each card shows its own name, description, eligible plans/intervals, customer
  discount, commission rate and duration. Its highlighted first-invoice amount
  uses only that programme's eligible catalogue and the existing integer-money
  preview. The rate supports the full approved range, including above 50%.
- Exact annual commission inside a shorter-than-year earning window requires
  actual service dates. Those programmes show the commission percentage as the
  headline, and annual table rows explain the allocation. They do not quote full
  annual earnings or claim a smaller monthly estimate is a maximum.
- The named View programme terms button opens the existing shared Radix dialog.
  Full conditions, payouts, refunds, deadlines, frozen terms version and all
  eligible price examples remain in `PublicProgrammeTerms`. The scrollable table
  is keyboard-focusable; the modal retains shared focus/Escape/close semantics.
  Joining remains visible outside the disclosure and uses the existing account
  signup/settings consent flow; opening terms accepts no agreement.
- `affiliate-programmes.ts` is a site display projection, not a payout calculator.
  `planPriceMinor` extracts the existing exact catalogue conversion for reuse;
  customer introductory pricing still calls the same canonical arithmetic.
  Names/descriptions remain escaped React text, and the existing API projection
  validation excludes operator/customer-private data.
- The route, SEO/sitemap manifest, footer, referral guide, unpublished announcement
  and local simulator share link now point to `/affiliates/`. No billing,
  attribution, payout, authentication or database schema behaviour changed.

## Verification

All package operations use Docker-scoped Make targets. These are source,
server-rendered component, build and HTTP checks; no browser screenshots or real
payment/provider actions were used.

| Gate                                                                                                                         | Local receipt                         |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Public-site checks: 113 tests plus eight dependency-policy checks pass                                                       | `.tmp/affiliate-cards-final-test.log` |
| Site export and local nginx refresh pass; existing MDX cache warnings remain                                                 | `.tmp/affiliate-cards-build.log`      |
| Independent site typecheck passes after the completed export                                                                 | `.tmp/affiliate-cards-site-types.log` |
| Core repository types and focused mock lint/format pass                                                                      | `.tmp/affiliate-cards-core-check.log` |
| Local page, canonical/sitemap and exact footer order verified; former route is 404; synthetic public API returns a programme | `.tmp/affiliate-cards-http.json`      |

New tests cover six eligible prices, selected catalogue subsets, rates through
100%, short annual windows, a named closed modal, escaped programme names,
programme-specific highlights, retained terms/examples/deadlines and the clean
canonical route. The new feature test first failed on the missing implementation;
the simulator test reproduced the stale share URL before its correction.

The first combined mock/projection run passed the mock checks but hit the existing
five-second generated-artifact timeout while compilation/typechecks were running.
The final unmodified check is recorded separately in
`.tmp/affiliate-cards-final-contracts.log`: all nine mock/projection checks pass.
No timeout or contract was weakened.

No commit, push, publication, deployment, campaign activation, actual payment,
provider mutation, dependency update or consumer-product change occurred. The
[payment audit](referral-payment-audit-20261117.md) retains the separate real Stripe
and controlled release gates. Review the UI at `http://localhost:5292/affiliates/`.
