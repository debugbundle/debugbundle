# Rounded pricing qualification — 8 November 2026

The approved pricing update is complete in source, local previews, Stripe test/live
catalogues and the twelve hosted deployment price references. Nothing was committed,
published or deployed; production runtime and feature switches are unchanged.
This supersedes the price amounts and candidate fingerprints in the earlier
[Business launch audit](business-launch-review-20261108.md).

| Tier     | Monthly base | Annual base | Annual headline | Extra unit month/year |
| -------- | -----------: | ----------: | --------------: | --------------------: |
| Solo     |           $5 |         $48 |           $4/mo |              $1 / $10 |
| Team     |          $19 |        $192 |          $16/mo |              $3 / $30 |
| Business |          $59 |        $588 |          $49/mo |              $3 / $30 |

USD before applicable tax. Annual allowances still reset monthly. No tier limits,
report budgets, access, SDK behaviour or subscription lifecycle rules changed.

## Source and presentation

FR-BIL-06, AC-BILL-04 and FR-BUS-01 / AC-BUS-01 govern this update. The shared catalogue
uses explicit annual minor-unit amounts. Public cards keep whole-dollar monthly
equivalents and disclose exact upfront charges; comparison rows show actual annual
extra-unit charges. Savings copy in the selector, dashboard, FAQs, docs and terms
no longer promises two months free. Current product/spec/overview tables and referral
annual examples agree ($529.20 first referred annual base invoice; $264.60 commission).
Historical release records and historical invoice-price fixtures retain their facts.

Developer billing mocks and disposable provider fixtures now read the shared
catalogue. The existing UI primitives, annual default, responsive layout and native
FAQ interactions are unchanged. No new routes, APIs, schema or dependencies.

## Verification

- Red was observed against the old shared catalogue and public presentation before
  the production change (`catalog-red.log`, `site-red.log`).
- Root typecheck, changed-code lint/format and 287 billing/catalogue/dashboard checks
  pass (`root-checks.log`). An additional 28 mock/contract checks pass, including two
  repeated contract checks (`mock-checks.log`).
- Site: 49 tests plus eight dependency-policy tests, types and 145-page production
  export pass (`site-final.log`). The existing compiler cache/chunk advisory warnings
  do not affect output validation.
- Stripe test mode: six provider scenarios pass, including quoted proration,
  discount/tax, retained quantity, actual test-clock renewal, capacity changes,
  declined payment, authentication-required recovery and duplicate retries.
  Scoped fixture cleanup has zero errors and leaves zero nonterminal subscriptions.
  Browser completion of Stripe-hosted payment challenges remains separate.
- Headless Docker pricing: desktop/tablet/mobile, annual default, both billing
  intervals, exact $4/$16/$49 cards and $10/$30 annual units, light/dark, keyboard
  controls and FAQ expansion pass without page errors/overflow. Screenshots were
  inspected. Twelve synthetic dashboard page checks pass on desktop/mobile.
- Local `/pricing`, `/docs`, `/docs/pricing` and `/terms` serve byte-identical current
  exports at localhost:5292. API/worker contain all twelve verified test price IDs,
  use a valid existing DebugBundle test credential and remain ready with activation
  switches off. Local account data/tier was not changed.
- Local runtime build and offline amount check pass: all twelve compiled catalogue
  amounts match the independently verified live prices. Five refreshed local
  CLI/MCP/OpenClaw/dashboard/site archives match the compiled files.

Evidence is in `.tmp/pricing-refresh/`; new screenshots/check receipts are in
`.tmp/business-audit/browser/`, with earlier screenshots retained under
`.tmp/pricing-refresh/browser-before/`.

## Provider and configuration receipt

The verified live account has zero nonterminal subscriptions, open Checkout
sessions and active payment links. Reused the existing Team $19 monthly price and
four existing products; created eleven prices and separate Business base/capacity
products. Twelve current lookup keys, recurring intervals, exact amounts, USD,
licensed quantities, exclusive tax and monthly product defaults were read back.
The complete test catalogue has twelve matching prices on separate base/capacity
products. No customer, invoice, subscription, payment or refund was changed in live
mode. The two permission barriers were resolved by explicit owner approvals for
catalogue-only hosted credential use and the twelve deployment price references.
The hosted credential never left its container; no hosted filesystem or service
configuration was changed.

The live catalogue and exact next-release mapping are also recorded in the private
cloud repo at `spec/stripe-pricing-catalog-20261108.json`. GitHub acknowledged all
twelve secret writes; names/update timestamps were independently read back. No
workflow or release was triggered. Three old monthly prices remain active until
the running checkout is switched during an authorised release. Archive them only
after runtime mapping and retained subscription/open-session checks; their lookup
keys already point to the new amounts. This is a release-order dependency, not a
customer-grandfathering feature.

## Candidate identity and remaining release boundary

- Base commit: `e113414540aa00ebbbac12ea0783ee0c16eacbaf` plus the uncommitted worktree.
- Runtime source SHA-256: `fc707e1a5a6717e566a1c7582c8385ed249857c79571a6876551d51525405afb`.
- Local image: `sha256:4076cc96fdee6dcc2354e26a76a074888ffc67557264e4720b92183a77ec8ba7`.
- Exact new archives: `.tmp/pricing-refresh/artifacts/manifest.json`.
- Source inventory: `.tmp/business-runtime-candidate/runtime-source-manifest.json`.
- Prior audit runtime context: `.tmp/business-runtime-candidate-before-pricing/`.

All source inventory entries match the workspace. The unchanged OpenAI 1.1.0 local
artifacts retain their earlier audit hashes; no portal state was modified. Package
publication still needs selected versions and fresh exact-artifact qualification.
The wider Business launch gates (owner tests, referral coupon/provider acceptance,
report-provider setup, migrations and compatible rollback, ChatGPT acceptance,
release/activation) remain those of the launch audit. Pricing setup does not certify
all those gates or authorise deployment.


## Documentation and navigation follow-up

The owner-approved follow-up centres only the pricing introduction through the
shared `SectionTitle` alignment variant; existing headings keep their default
alignment. The Enterprise comparison action now uses `#compare-plans` on the same
page. `/docs/pricing/` remains available as **Plans and capacity**, with its existing
section anchors retained. It explains trials, monthly resets, extra-unit increments,
people, reports, referrals and self-hosting, while price and feature comparisons
link to `/pricing/`. Billing docs and related guide links follow the same boundary.
The two guides are listed together in the Help navigation. No prices, provider
configuration, limits, backend behaviour or deployment changed in this follow-up.

The previous source-text test for a duplicate docs comparison was moved to the
site's actual rendered comparison model; the core contract still verifies the
extra-unit analytics increments against enforced tier capabilities. Three expected
site failures were observed before implementation. All 52 site tests, eight
existing dependency-policy tests, site types, 13 documentation/catalogue contract
checks and the 145-page export pass. Docker headless checks verify centre alignment,
completed same-page hash navigation, the original pricing interactions and retained
docs anchors on desktop/tablet/mobile. Screenshots were inspected; 22 current
pricing/capacity/billing links resolve in the export. An initial browser assertion
ran before Next.js completed navigation; the final check waits for the expected
URL before asserting both the hash and visible comparison target.

Receipts and the extended one-off browser runner are under
`.tmp/pricing-docs-refinement/`. The new `public-site.tar.gz` and
`site-manifest.json` there supersede only the earlier public-site archive. Local
`/pricing/`, `/docs/pricing/` and `/docs/billing/` serve the exact current export.
The runtime source snapshot and all billing/provider receipts are unchanged.

## Enterprise placement follow-up

The owner-approved page order is tier cards, Enterprise contact section, plan
comparison, then FAQs. The existing Enterprise component and actions are composed
between the cards and comparison without changing their styling or billing state.
All 52 site tests, eight dependency-policy tests, site types and the 145-page export
pass. Headless desktop/tablet/mobile checks verify the section order, comparison
anchor, billing toggle and FAQ interactions. Local port 5292 serves the exact new
export. `.tmp/enterprise-pricing-placement/public-site.tar.gz` and its
`site-manifest.json` supersede the previous site archive only; runtime and provider
receipts are unchanged, and nothing has been deployed.

## Repeated comparison-link correction

The prior browser review covered the first comparison click. A follow-up reproduced
the router suppressing the scroll when the URL already contained `#compare-plans`.
Shared product CTA fragment links now use native anchors; route links retain Next
navigation. The browser regression failed before the fix and passes afterwards.
Actual port-5292 checks cover first/repeated clicks, keyboard activation after a
billing change, both pricing URL forms, desktop/tablet/mobile and no-JavaScript
navigation. Site tests/types and the export pass. The latest unpublished site
archive and served-byte receipt are under `.tmp/pricing-anchor-fix/`; earlier site
artifacts remain historical, and runtime/provider state is unchanged.
