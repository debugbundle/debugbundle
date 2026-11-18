# Referral programmes — internal review guide

Creator confirmations, programme first-purchase celebrations and conditional daily
email summaries are recorded in the [notification review](creator-referral-emails-review.md).

The public page is now `/affiliates/`, with compact cards and a shared terms modal.
The [affiliate presentation review](referral-affiliate-cards-review.md) records
the owner-approved naming and layout follow-up, tests and local review URL.

Ready for internal review. Local tests, coverage and candidate builds pass;
[the follow-up audit](referral-programmes-audit-20261116.md) contains current
evidence and artifact identities, alongside the preserved
[original qualification record](referral-programmes-qualification.md).
The later [UI review](referral-ui-review-20261116.md) records the compact notice,
form accessibility and price-alignment refinements in the current local builds.
The [automatic payment setup review](referral-automatic-payment-setup-review.md)
records the approved activation/scheduling follow-up and its separate provider gate.
The subsequent [payment audit](referral-payment-audit-20261117.md) records two
catalogue fixes and the current billing, integration and runtime-build evidence.

All work is local and uncommitted on `feature/referral-programmes` in core,
the independent `site` repository and `.local-repos/debugbundle-cloud`.
Starting revisions: core `9c9e5042`, site `9a3c2c1`, cloud `1dd5349`.
No publication, push, deployment, live programme activation, provider write,
payment, transfer or consumer-product change is included.

## Review the product journey

1. Public `/affiliates/`, its footer entry and the referral guide explain the
   current programme's exact conditions and earnings. Public terms come from
   available versions; no active version is seeded. The announcement is held in
   `site/docs/drafts/referral-programmes.mdx`, outside published blog content.
2. An incoming link or explicit manual code shows an available offer and actual
   introductory/renewal prices. Hints are not eligibility or saved claims.
   Failed lookups show standard pricing with recovery guidance and preserve a
   validated presented code through signup. The compact banner stays visible;
   its details open the shared modal, and
   removing a pending code is a separate action.
   Check removal and replacement followed by refresh: the old URL hint must not
   return. An invalid code must show an error rather than a replacement prompt.
3. Email/GitHub new-account creation stores an identity/workspace-bound intent
   atomically. Verification and bounded recovery save the actual claim. A trial
   uses neither the introductory benefit nor the commission window. Returning
   logins cannot attach a newly encountered code to an arbitrary workspace.
4. Billing reads the saved claim across devices. Explicit replacement/removal
   needs confirmation. A promotion can replace the discount while retaining the
   original partner agreement. The signed purchase review shows the full annual
   amount where applicable, extra capacity, tax treatment and normal renewal.
5. Settings → Referrals shows the creator's accepted terms, permanent code/link,
   actual new-referral availability, examples, customer statuses and earnings.
   Corrections retain aliases and ownership. Blocked aliases cannot admit new
   claims through either v1 or v2; existing promises and balances remain.
6. Programmes & offers, beside Analytics, uses the same allowlist and verified
   email-code ceremony. Review drafts, automatic payment setup and lifecycle changes;
   code/claim/grant inventories; scoped support actions; and cohort performance.
   Temporary CLI/MCP authority lasts 15 minutes and grants no payout rights.
   A revision whose discount rounds any eligible base invoice to zero cannot be
   activated or scheduled; the operator must create a lower-discount revision.

Initial offer: 20% off one eligible positive Solo, Team or Business base invoice;
monthly first month or yearly first year paid upfront; normal renewals. Creator
earnings: 50% of eligible collected base cash in the original 12 calendar months,
after refunds and excluding tax/capacity/noncash credit. Original 10% Business
claims and their financial contracts remain supported. Code alone never bypasses
the seven-day first-purchase restriction.

## Code and contract navigation

| Concern                                                   | Main owners                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Policy, exact money, cookies, signed quotes               | `packages/referrals/src/programme-policy.ts`, `offer-*`, `commission-policy.ts`                                     |
| Versions, ownership, claims, intents, grants, delegations | `packages/storage/src/offer-*`, `legacy-offer-adapter.ts`                                                           |
| Migration/readiness                                       | `offer-programme-schema.ts`, `schema-migrations.ts`                                                                 |
| Checkout and invoice/ledger settlement                    | billing checkout stores, `stripe-checkout.ts`, `offer-benefit-reconciliation.ts`, referral receipt worker/ledger    |
| Verified reporting                                        | `offer-performance.ts`, `offer-performance-store.ts`; existing ledger remains the accounting authority              |
| HTTP, CLI, ordinary MCP                                   | `/v2/offers/*`, shared `packages/referral-client/src/offer-api.ts` registry and adapters                            |
| App                                                       | shared offer components, Billing/Referrals/Programmes and email auth pages                                          |
| Public site                                               | generated pure policy projection, offer provider/pricing, `/affiliates/`, terms/privacy/guide and announcement draft |
| Hosted source                                             | fixed `/r/CODE` edge redirect, default-off environment flag and compatible reader rollback gate                     |

The [implementation contract](referral-programmes.md), approved
[plan](referral-programmes-plan.md), FR-REF-01–10 and AC-REF-01–10 are the acceptance
map. New programme data is additive; old migration checksums and v1 response
schemas are preserved. Restricted agent and hosted OpenAI/OAuth catalogues remain
unchanged. SDK capture parity is not applicable; no SDK code changed.

## Local qualification commands

### Public-page review

The static preview alone uses the hosted API by default. For an isolated public
review with a synthetic programme, use:

```sh
make referral-public-review
```

Open `http://localhost:5292/affiliates/`. This rebuilds the static preview with
`NEXT_PUBLIC_DEBUGBUNDLE_API_URL=http://localhost:3004` and runs the actual public
offer routes against a dedicated tmpfs database. The clearly labelled **Local
review referral programme** uses the approved 20% introductory discount and 50%
commission for 12 months across Solo, Team and Business. Enter `REVIEW20` to
review the pending-offer notice and pricing; its cookie is only a local hint.

This fixture supplies no real credentials, mail, account authentication, Checkout
or provider transport. App/signup links retain their normal destinations; this
target qualifies the public review surface, not a payment or signup journey.
Only port 3004 is published, bound to loopback; the database has no host port.
The dedicated bridge permits the host to access the API. Its source mount is
read-only, it ignores ordinary database environment settings, and startup refuses
any database except `debugbundle_referral_review`. Label checks prevent replacing
or deleting foreign containers or networks. The `referral-review` Compose profile
owns both services under the ordinary `debugbundle` project, with a separate
network. The `public-preview` profile owns the nginx preview on 5292. Adoption
of the older standalone containers dumps/restores their synthetic data first.
Restarting the API preserves the sample programme while the database container
is running; stopping a tmpfs database discards its synthetic records.

To start all ordinary local services and both independent previews together:

```sh
make dev-review
```

This preserves the app's populated mock mode on 5291, starts its underlying real
API/worker/infrastructure, waits for readiness and rebuilds the public preview.
The ordinary API remains on 3003. Public fixtures and private in-memory edits
remain independent; this command does not qualify real account/payment journeys.

```sh
make referral-public-review-stop
```

This removes only the owned review API, tmpfs database and network, discarding
their synthetic data. The static preview remains configured for that local API
until rebuilt. `make dev-public-refresh` restores the default hosted API build;
production builds never inherit the local override unless explicitly supplied.

### Private app UI preview

`http://localhost:5291/programmes` opens the local UI simulator. The existing
loopback-only Vite preview is started with `make dev-mock`; it requires no real
account, email, Stripe or database credentials. Its clearly labelled synthetic
programme supports reviewing draft/revision forms, simulated automatic payment
setup, lifecycle controls and promotional codes. Internal Analytics is available at
`/analytics`; creator and customer views remain under `/settings/referrals` and
`/billing`. Titles appear in the top app header and the two operator pages link
to each other. The Create programme action sits opposite the tabs.

The simulator handles both v1 and v2 API requests locally, rejects foreign
Host/Origin headers, and keeps all changes in memory. Restarting resets them.
Empty referral balances, client/payment histories, operator inventories and
analytics are synthetic empty states. Unsupported support/payment operations
return an explicit unavailable error; live-mode coupon binding is refused.
This is UI review, not validation of operator authentication, provider binding
or financial settlement. Those retain their real-service acceptance gates.
The public preview on 5292 still uses its separate real-route fixture on 3004;
drafts/codes created in the private simulator do not populate that database.

### Automated qualification

Use Docker-backed Make targets. No real provider credentials or existing database
are needed for the synthetic referral qualification:

```sh
make referral-programmes-integration
make referral-programmes-coverage
make lint
make typecheck
make test-unit
make candidate-build
make referral-site-contracts
make public-site-artifacts
make -C site check-isolated
make -C .local-repos/debugbundle-cloud test-deploy test-site
make -C .local-repos/debugbundle-cloud local-referral-runtime-candidate
```

The referral harness owns a random labelled private network and tmpfs Postgres,
has no host database port or persistent volume, and checks ownership on cleanup.
Its reset helper requires the disposable marker. Formatting/lint and changed-file
coverage are separate required gates; exact final commands/results are recorded
in the qualification record. Browser investigation/screenshots are outside the
authorised source/test workflow and were not used as a completion gate.

## Provider and release preparation

These steps are prepared for a separately authorised release; they have not run:

- Preserve the existing `REFERRAL_SECRET`, migration ledger and financial state.
  Rotating the identity secret is a migration concern, not ordinary configuration.
- Activate/schedule from the programme card after reviewing terms and claim limits.
  The backend prepares or verifies its once-only percentage coupon automatically,
  using server-configured mode and exactly the eligible base products. The normal
  UI has no coupon-ID or test/live fields. Capacity/ineligible products must be
  distinct. Provider redemptions have no global cap or expiry, so domain-reserved
  claims survive trials. Preserve bound coupons while claims remain. Existing
  manual binding remains available to compatible API/CLI/MCP callers. Automatic
  setup needs coupon read/create and price-read permissions; it creates no charge.
  Stripe's
  [coupon reference](https://docs.stripe.com/api/coupons/object) and
  [subscription discount guide](https://docs.stripe.com/billing/subscriptions/coupons)
  define the provider fields. The current integration retains its pinned Clover
  API and DebugBundle's existing no-card domain trial.
- In an explicitly authorised Stripe sandbox, qualify all six plan/interval
  totals with base/capacity/tax, failed payment, retry, expiry, zero/trial invoice,
  partial cash, refund and dispute receipts. Keep exact provider evidence private.
  Synthetic transport fixtures do not establish real provider acceptance.
- Deploy the additive forward migration before offer-aware API/worker code.
  Readiness rejects missing/altered financial columns, guards and unique indexes.
  Introduce a disabled reader bridge, then retain a second verified compatible
  API/worker pair before enabling new claims. `referral-offers-v1` is the reader
  floor; flag-off never authorises old binaries after versioned promises exist.
  Retain schema and reconciliation when pausing. Do not reverse-migrate.
- Configure the exact programme, cap or unlimited acknowledgement and accepted
  terms through the gated operator flow. Activation is explicit. Review the
  launch economics after 90 days; normally review payouts monthly from US$50
  available, retaining smaller obligations for later/final settlement.
- Publish the public content/announcement only after matching live policy and
  source/provider/runtime acceptance. Publication and rollout require separate
  owner authority.

Prospective distribution eligibility: CLI, MCP and its OpenClaw wrapper contain
new executable capability and need coordinated publication if selected for
release. All capture SDKs/adapters/relays/native bridges retain their versions.
Private internal packages and hosted/site artifacts follow their own build and
rollout paths. No versions, tags or registry entries were changed here.

## Retained local review artifacts

The exact dirty-tree file/route/table inventory and SHA-256 source manifest are
`.tmp/referral-review-inventory.md` and `.tmp/referral-review-source-manifest.json`.
`.tmp/referral-review-artifact-manifest.json` identifies the CLI/MCP/OpenClaw
bundles, dashboard/site review archives and local hosted image. The static site
is retained at `.tmp/referral-site-export`; the ordinary `site/out` and the earlier
business runtime candidate are preserved. These are local review evidence,
not published packages, deployed bytes or real provider acceptance.

## Creator payment preferences follow-up

The approved five-currency payment setup, fixed recipient countries, routine US$50 policy and persistent blue-link banner are documented in the [payment preferences review](referral-payout-preferences-review.md). Creator setup is in Settings → Referrals after joining a programme; programme editors have no additional payment controls. Current preference deletion on account anonymisation remains pending explicit owner approval.
