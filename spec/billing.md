# Billing

Version: v1
Last updated: 2026-10-22 (local safety candidate)

---

## 1. Purpose

This file is the source-of-truth design for the complete DebugBundle billing system.

It covers:
- Stripe product catalog and what must be configured in the Stripe Dashboard
- how no-card Solo and Team trials behave before Stripe checkout begins
- how organizations become paying customers (checkout flow)
- how customers manage their subscriptions (customer portal)
- how Stripe billing state syncs back to DebugBundle (webhook sync)
- entitlement rules derived from subscription state
- failure handling, email lifecycle, and testing requirements

If this file conflicts with a weaker summary elsewhere, this file wins for billing behavior.

Pricing amounts and tier definitions live in `/spec/product.md` section 13 (source of truth for pricing numbers). This file focuses on how those tiers are implemented through Stripe and enforced in the product.

GitHub Marketplace listing support is related but distinct. In the current model, GitHub Marketplace webhook events are tracked for listing-originated purchase/subscription state and install attribution, while Stripe remains the authoritative source of truth for paid DebugBundle entitlements.

---

## 2. Stripe Product Catalog

### 2.1 Products to Create in Stripe Dashboard

DebugBundle requires the following Stripe products:

**Plan subscriptions (one per paid tier):**

| Product | Description | Billing |
|---------|-------------|---------|
| Solo Plan | DebugBundle Solo — 3 included capacity units, solo developer tier | $4.99/month recurring, excl. VAT/taxes |
| Team Plan | DebugBundle Team — 15 included capacity units, collaboration tier | $19/month recurring, excl. VAT/taxes |

**Extra capacity add-ons (one per paid tier):**

| Product | Description | Billing |
|---------|-------------|---------|
| Solo Extra Capacity | Additional capacity unit for Solo plan | $0.99/month recurring, quantity-based, excl. VAT/taxes |
| Team Extra Capacity | Additional capacity unit for Team plan | $1.99/month recurring, quantity-based, excl. VAT/taxes |

### 2.2 Price Configuration

Each product must have a single default monthly-recurring Price in Stripe.

All paid prices are denominated in USD and exclude VAT or other applicable taxes. Taxes are calculated and applied at checkout. Stripe Prices must use `tax_behavior: exclusive` so Checkout can apply the correct tax for the customer.

Extra-capacity prices must have `usage_type: licensed` and allow quantity > 1 so customers can purchase multiple capacity units in one subscription item.

Annual billing is explicitly deferred to post-V1. Do not create annual prices yet.

### 2.3 Environment Configuration

The API must be configured with:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls (Checkout Session creation, webhook verification, subscription reads) |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint signature verification secret |
| `STRIPE_SOLO_PRICE_ID` | Price ID for Solo plan subscription |
| `STRIPE_TEAM_PRICE_ID` | Price ID for Team plan subscription |
| `STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID` | Price ID for Solo extra capacity |
| `STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID` | Price ID for Team extra capacity |

Hosted production deploys must source these values from `debugbundle-cloud` GitHub Actions secrets and merge them into the runtime env during deploy rather than relying on one manually maintained host-only `.env`.

Legacy static URL variables (`STRIPE_SOLO_CHECKOUT_URL`, `STRIPE_TEAM_CHECKOUT_URL`, `STRIPE_CUSTOMER_PORTAL_URL`) remain local/manual fallback scaffolding only. With `NODE_ENV=production`, the fallback returns no link: incomplete dynamic configuration must not bypass ownership checks or durable reservations.

### 2.4 Price-to-Plan Mapping

The webhook handler must be able to map a Stripe Price ID back to the internal plan and product type.

This mapping must be configured once and used consistently across checkout creation, webhook processing, and billing summary computation.

```
STRIPE_SOLO_PRICE_ID       → plan: "solo", type: "plan"
STRIPE_TEAM_PRICE_ID       → plan: "team", type: "plan"
STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID → plan: "solo", type: "extra_capacity"
STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID → plan: "team", type: "extra_capacity"
```

---

## 3. Customer-Organization Link

### 3.1 When the Link Is Established

The `organizations.stripe_customer_id` field is set when the first Stripe Checkout Session completes.

Before checkout: the organization has no Stripe customer. After checkout: the organization is linked to a Stripe customer and subscription.

### 3.2 Organization Billing Fields

The `organizations` table stores the effective entitlement snapshot:

| Field | Purpose |
|-------|---------|
| `plan` | Current effective plan: `free`, `solo`, `team` |
| `stripe_customer_id` | Stripe Customer ID (set after first checkout) |
| `stripe_subscription_id` | Stripe Subscription ID (set after first checkout, updated on changes) |
| `additional_capacity_units` | Currently valid purchased extra capacity count (set-based, not incremental) |
| `billing_state` | Effective billing lifecycle state: `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `admin_override`, `trialing`, `trial_expired` |
| `billing_period_starts_at` | Current billing period start (for usage-window display and metering alignment) |
| `billing_period_ends_at` | Current billing period end (for UI display and renewal timing) |
| `last_billing_sync_at` | Timestamp of last successful webhook-driven entitlement sync |
| `last_billing_event_id` | Stripe event ID from last processed webhook (idempotency reference) |
| `trial_plan` | Selected no-card trial plan: `solo`, `team`, or `null` |
| `trial_started_at` | Timestamp when the no-card trial began |
| `trial_ends_at` | Timestamp when the no-card trial ends |
| `trial_used_at` | One-time eligibility ledger timestamp; set on first trial start and never cleared |
| `trial_converted_at` | Timestamp when a prior no-card trial converted to paid entitlements |
| `trial_expired_at` | Timestamp when an unconverted no-card trial was downgraded back to Free |

### 3.3 Free Organizations

Organizations on the `free` plan have:
- `stripe_customer_id`: null
- `stripe_subscription_id`: null
- `additional_capacity_units`: 0
- `billing_state`: null
- All billing-period fields: null

If a no-card trial already expired, the organization still returns to `plan = "free"` but keeps its trial history and uses `billing_state = "trial_expired"`.

### 3.4 No-Card Trial State

DebugBundle supports one 30-day no-card trial per organization account for `solo` or `team`.

Effective no-card trial entitlement:
- `plan` = selected trial plan
- `billing_state` = `trialing`
- `stripe_customer_id` = null
- `stripe_subscription_id` = null
- `additional_capacity_units` = 0
- `billing_period_starts_at` = `trial_started_at`
- `billing_period_ends_at` = `trial_ends_at`

Eligibility and lifecycle rules:
- Every new organization starts from the Free baseline.
- `trial_used_at IS NULL` means the organization is still eligible.
- Expiry and conversion never clear `trial_used_at`.
- Solo trial can convert to paid Solo or Team.
- Team trial can convert to paid Team only.
- Active no-card trials cannot buy extra capacity; capacity routes must reject them with `409 trial_conversion_required`.
- Any downgrade to a lower-capability tier must suspend setup for features that no longer belong to that tier; route-level `upgrade_required` checks are not enough.
- Team to Solo pauses Team-only collaboration and Slack setup while preserving the saved setup for later reactivation.
- Solo or Team to Free pauses remote probes, GitHub automation setup, Slack setup, collaborators/invites, and hosted improvement opportunities/settings while preserving the saved setup for later reactivation.
- Free downgrades must not delete hosted improvement bundle objects solely because of the downgrade. Existing hosted improvement artifacts remain subject to normal retained-bundle caps and retention, and retrieval/generation paths must enforce the current tier.

---

## 4. Checkout Flow

Before Stripe checkout begins, eligible Free organizations may start a 30-day no-card Solo or Team trial from pricing, billing, API, CLI, or MCP. The temporary first-purchase restriction unlocks Checkout after seven full 24-hour days from the trial start, so conversion remains possible before trial expiry. Direct Free-to-paid cannot bypass this wait. Previously paid organisations retain their resubscription path.

### 4.1 Production Checkout State

The production implementation creates Stripe Checkout and portal sessions dynamically whenever the Stripe SDK is fully configured with secret and price-id env vars.

Static fallback URLs still exist as a development scaffold when Stripe credentials are intentionally absent:
- `STRIPE_SOLO_CHECKOUT_URL` → static Payment Link or Checkout URL for Solo
- `STRIPE_TEAM_CHECKOUT_URL` → static Payment Link or Checkout URL for Team
- `STRIPE_CUSTOMER_PORTAL_URL` → static portal link

Those fallback URLs cannot carry the `organization_id` to Stripe, so hosted production must use dynamic session creation instead of relying on static links.

### 4.2 Dynamic Checkout Sessions

The checkout route must create a Stripe Checkout Session dynamically using the Stripe SDK.

**Required Checkout Session parameters:**

| Parameter | Value |
|-----------|-------|
| `mode` | `subscription` |
| `customer` | Existing `stripe_customer_id` if organization already has one, otherwise omit (Stripe creates new customer) |
| `client_reference_id` | `organization_id` (critical for webhook linking) |
| `metadata.organization_id` | `organization_id` (backup for webhook linking) |
| `line_items` | Plan price with quantity 1 |
| `success_url` | Redirect URL after successful payment (web app billing page with success indicator) |
| `cancel_url` | Redirect URL if customer cancels checkout (web app billing page) |
| `subscription_data.metadata.organization_id` | `organization_id` (persists on subscription for all future webhooks) |
| `allow_promotion_codes` | `true` (enable promo codes from day one) |

**Extra capacity add-on:** Extra capacity units are managed directly inside the DebugBundle billing page after subscription creation. Increasing capacity updates the Stripe subscription immediately. Reducing capacity creates or updates a Stripe subscription schedule so the lower quantity only takes effect at the next renewal boundary. Paid organizations can hold up to 99 purchased extra capacity units. These units expand shared allowance capacity only; they do not gate project creation.

Checkout validation must also enforce trial conversion rules:
- Active Solo trial: allow paid Solo or Team checkout.
- Active Team trial: allow paid Team checkout only.
- Active no-card trials are not required to expire first, but the first paid purchase must wait seven full days from the immutable trial start.

### First-purchase restriction (local candidate)

The organisation-locked Checkout claim checks the shared elapsed-time policy before creating, returning or replaying any Checkout request. Missing, malformed or future trial starts fail closed with `409 paid_purchase_locked`. The server uses its own clock; browser time cannot grant eligibility. A processed, organisation-scoped `invoice.paid` receipt exempts previously paid accounts. Customer IDs, incomplete/terminal subscriptions and trial conversion timestamps alone are insufficient proof. The existing provider-terminal check is still required before resubscription.

The billing page reuses CalloutCard and Button and shows the exact local unlock date/time only after a valid trial start while the first paid purchase remains locked. The entire paid-unlock notice is absent before trial start and once payment unlocks. Start trial remains available and unavailable first-purchase buttons stay disabled. “Need to subscribe sooner? Contact us” links to `https://debugbundle.com/contact/`. Summary fields provide presentation hints for historical paid accounts; the locked server claim remains authoritative and reports an explicit refusal when history needs review. The page refreshes at the unlock boundary and on visibility/focus. No billing-summary fields, new automation tools, dependencies, styles or automatic support overrides are added.

Paid plan management and provider-confirmed payment/webhook reconciliation continue normally. Blocked attempts stay reserved, including uncertain or completed attempts; the policy never rotates them on age. Existing hosted Stripe URLs remain usable until Stripe expires them and cannot be revoked by this creation gate. Any account hold, refund, subscription cancellation, legacy-session reconciliation or release requires its own authorised operational action. Account age can be waited out and does not establish trust.

### 4.2a Checkout safety candidate (not deployed)

`billing_checkout_attempts` holds one organization-scoped attempt, fixed Stripe request parameters and its eventual session ID. A short organization row lock serializes reservations; no provider call holds that transaction. Persist the reservation before any Stripe call. Retrying must reuse the request and `billing-checkout:<attempt-id>` key. Return the same open session; completed/uncertain attempts remain reserved. Only a Stripe-confirmed expired session, or a completed session whose exact linked subscription is confirmed `canceled`/`incomplete_expired`, can be retired with an attempt/session compare-and-set. The cached internal `canceled` state alone is insufficient: paused subscriptions must not start another purchase. A different plan while the reservation is open returns `409 checkout_in_progress`; a saved session can still be checked for expiry and then replaced with the requested plan. An unsaved different-plan attempt remains reserved. A pending reservation that cannot be reconciled needs operator review, not a new charge attempt.

New sessions set `expires_at` to reservation time plus one hour and request `payment_method_options.card.request_three_d_secure = any`. This asks the issuer for supported authentication; it does not guarantee a challenge, liability shift or rejection of unsupported cards. Hosted Checkout/Radar protections remain necessary. No CVC/AVS rules, live catalog, customer, subscription or refund settings are changed by this patch.

The route additionally limits organization requests to five/minute and client-IP requests to ten/minute through the existing shared limiter. A reservation survives process/Redis restarts. Suspensions are rechecked inside the reservation transaction. Linked non-terminal subscriptions cannot create another recurring Checkout. Paid Solo-to-Team requests use the same-subscription path below. Cancellation events retain checkout reservations: only explicit session reconciliation may retire the exact completed purchase, so a delayed cancellation cannot erase a later uncertain attempt. Active paid access and portal management remain available.

`503 billing_service_error` reports provider/persistence failure; `503 billing_not_configured` remains the absent-provider fallback. Audit entries retain the reason without provider credentials or card details.

Migration `202610220001_add_billing_checkout_attempts` is additive, checksummed and required before runtime activation. Stored parameters contain the existing billing email/provider routing, not card data or credentials; records stay internal, bounded to one per organization, and cascade with account deletion. Future rollout must reconcile legacy open sessions before enabling this flow; the patch cannot revoke URLs issued by an older version.

### 4.2b Same-subscription Solo-to-Team upgrade candidate

The existing owner/session/CSRF-protected `POST /v1/billing/checkout` retains `200 {url}`. For a paid Solo subscription targeting Team, it reserves one `billing_subscription_operations` record and updates the existing subscription. It changes the existing base item to the Team Price and the existing extra-capacity item to the Team capacity Price, preserving the exact purchased quantity (including 99 units). It never creates another recurring Checkout or subscription.

`packages/billing/src/stripe-subscription-upgrade.ts` persists the exact item IDs, Prices, quantities and `proration_date` before dispatch. The update uses `payment_behavior=pending_if_incomplete`, `proration_behavior=always_invoice`, an eight-second request timeout, no automatic network retries and `billing-subscription:<attempt-id>:update` idempotency. Stripe invoices the unused-period credits and new-period charges together. Existing Solo entitlement policy remains unchanged; Team is derived only from applied current Stripe items.

An open update invoice returns its validated Stripe-hosted invoice URL. Required authentication or a declined card is recovered on that same invoice; app retries do not create a replacement invoice. A paid invoice awaiting application stays reserved. Once Stripe reports applied Team items, the link returns to the existing billing-success polling route without inventing a Checkout Session ID. For upgrade and capacity payments, the existing dialog offers “Continue payment on Stripe” as an explicit link that opens a separate tab and closes the dialog. The original billing page remains open, refreshes on return/focus and grants no capacity or plan success before the authoritative paid state. Pending capacity disables conflicting changes; reopening resumes the same provider operation. A paid upgrade still uses the existing billing-success route. Hosted return/authentication behaviour remains an independent verification gate.

Stripe's `subscription_update_confirm` portal flow supports only one item and cannot update a subscription with extra capacity. This candidate uses the subscription pending-update API instead. It requires an active, automatically charged subscription with a paid prior invoice and complete known item shapes. Scheduled reductions, scheduled cancellation, another pending update, paused/past-due/trialing subscriptions and mismatched ownership fail closed before a fresh update. Cancel an existing scheduled reduction through its existing explicit route before requesting the upgrade; the candidate does not silently discard it.

The same durable operation slot coordinates capacity increases, scheduled reductions and cancellation of reductions. Capacity increases retain existing entitlements until payment applies; reductions remain effective at renewal. Exact provider commands and stable step keys are persisted. Schedule creation and update have separate keys, and a saved schedule ID is reused after failure. Conflicting operations return `409 billing_change_in_progress` (upgrade uses the existing `checkout_in_progress`). An unprepared validation failure can release its slot; a prepared uncertain operation cannot. A completed record can be replaced by the next explicit operation.

Stripe may prune idempotency keys after 24 hours. Ambiguous subscription mutations stop replay at 23 hours (with at most one minute of DB/API clock tolerance), remain reserved and require reconciliation. Age never rotates an attempt. Only an exact provider-voided upgrade or capacity invoice with no pending update permits retirement and a later explicit fresh attempt. Known invoice IDs remain readable for reconciliation after the replay deadline.

Subscription-change webhooks retrieve the current subscription instead of deriving entitlements from a delayed event payload. Storage fences old subscription IDs; cancellation mail is suppressed when the old subscription no longer matches. A failed pending-upgrade invoice must not mark paid Solo past due or emit base-plan downgrade/dunning emails. Both paid-invoice and subscription-update ordering paths compare the previous snapshot and send the applicable plan-change confirmation; update invoices do not masquerade as renewals.

Additive migration `202610220002_add_billing_subscription_operations` follows the checkout reservation migration and must run before dependent runtime activation. The record contains internal subscription/customer references and fixed provider commands, no card data or credentials. It is bounded to one per organization and cascades on account deletion. Bootstrap remains empty-schema-only; no existing production snapshots are repaired automatically.

Provider contracts: [pending subscription updates](https://docs.stripe.com/billing/subscriptions/pending-updates), [subscription update/proration](https://docs.stripe.com/api/subscriptions/update), [portal flow item limitations](https://docs.stripe.com/customer-management/portal-deep-links), and [idempotency retention](https://docs.stripe.com/api/idempotent_requests). Local tests use provider fakes and disposable PostgreSQL; no live subscription was changed to verify this candidate.

### Confirmation and recovery invariants

Paid Solo-to-Team uses the existing accessible billing dialog before attempting payment. `POST /v1/billing/upgrade/preview` reads Stripe invoice previews and returns due-now amount, tax, recurring monthly total and retained extra units with a signed ten-minute token. The token is bound to the organization, subscription, current items/period and fixed proration date. Confirmation rechecks eligibility and the same preview amounts; a changed or expired quote requires another review. The quote uses a domain-separated HMAC with the existing webhook signing secret, never sent to the browser. A prepared ambiguous request keeps its original parameters even after the quote expires; retry only reconciles/replays that already confirmed operation. Preview may instead return the already saved open invoice for payment recovery.

Capacity purchases also use `pending_if_incomplete` with `always_invoice`. Active paid automatic subscriptions are required; the existing paid capacity remains until the invoice is paid and the requested items are applied. An open invoice returns `payment_required: { url }`, which web, CLI and MCP expose without reporting success. Reading billing or receiving a webhook reconciles completed paid operations so later capacity changes are not permanently blocked. Exact void invoices may be retired; time alone never clears an ambiguous payment.

Reduction phases preserve existing subscription/item discounts and tax settings. Only the known two-phase capacity reduction can be updated or released; unrelated subscription schedules fail closed. Current Clover item periods (or a validated current provider schedule) determine the effective date; cached application periods alone cannot authorize a future charge change. Future item prices, discounts, taxes and metadata must not be silently overwritten, and schedules with unsupported custom settings remain blocked. Unknown, duplicated, mixed-plan or truncated paid item lists fail closed without inventing a downgrade. Terminal subscriptions never project paid capacity.

Checkout creation and upgrade preview require a verified owner browser session (FR-AUTH-04), CSRF and rate limits. Checkout return always retrieves the current subscription, validates customer/organization/mode/payment state and atomically updates using the database row revision. A newer webhook wins over a stale return. The return UI reports verification pending until state is confirmed; query-string flags are not payment proof. Changing plans while an earlier Checkout is open remains blocked until provider-confirmed expiry; the user can resume the original plan. An ambiguous unsaved attempt stays reserved. Its original one-hour expiry bounds replay to less than 23 hours from creation; beyond that, only reconciliation is allowed, never an age-based replacement.

Webhook handling serializes each account, locks its row before provider retrieval, and reads persisted pre-change entitlements for transition notifications. Billing state, processed event and notification outbox entry commit together. Migration `202610220003_add_billing_lifecycle_notifications` expands the existing operational-email kind constraint before API/worker activation. Workers deliver and retry through the existing operational-email queue. Deployment must activate the compatible worker and retire older workers before activating the API producer; older workers cannot process the new kind. On rollback, keep a compatible worker until queued billing notifications are delivered or explicitly reconciled; do not roll the kind constraint back or delete pending notifications. A failed standalone invoice cannot change subscription dunning state. This prevents lost mail from an inline send failure; transport delivery remains at-least-once, not a promise of globally exactly-once email.

### 4.3 Checkout Route Changes

The existing `POST /v1/billing/checkout` route must be updated to:

1. Accept `target_plan` in the body (already exists)
2. Validate plan upgrade path (already exists)
3. Create a Stripe Checkout Session via Stripe SDK (replaces static URL lookup)
4. Return the Checkout Session URL to the frontend
5. Handle errors (Stripe API failure → `503 billing_service_error`)

The dynamic Checkout Session success URL must include Stripe's `{CHECKOUT_SESSION_ID}` placeholder, for example `/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`. On return, the web app calls `POST /v1/billing/checkout/confirm` with that session ID. The API retrieves the Checkout Session and subscription from Stripe, verifies the session belongs to the authenticated organization via `client_reference_id` or `metadata.organization_id`, and syncs the derived billing snapshot from Stripe before returning the updated billing summary. This confirmation path is a user-return recovery path; Stripe webhooks remain the authoritative asynchronous source of truth for ongoing lifecycle changes.

### 4.4 Portal Route Changes

The existing `POST /v1/billing/portal` route must be updated to:

1. Create a Stripe Billing Portal Session via Stripe SDK (replaces static URL)
2. Use the organization's `stripe_customer_id`
3. Return the Portal Session URL
4. Handle missing customer ID (org not yet linked → `409 no_active_subscription`)

### 4.5 Portal Capabilities

The Stripe Customer Portal must be configured to allow:
- Subscription cancellation
- Payment method updates
- Invoice history viewing

Paid Solo-to-Team changes enter through the existing checkout route but update the same subscription using the pending-invoice path in section 4.2b. The general portal retains cancellation, payment-method and invoice management; it is not used to bypass the explicit upgrade path. The approved Team-to-Solo flow uses the existing Dialog/Button primitives to preview and confirm a same-subscription schedule at renewal. It retains purchased extra units, shows included capacity changing from 15 to 3 and explains that collaboration/Slack pause with saved setup retained. Cancellation and capacity reduction remain separate operations.

### 4.6 In-App Capacity Management

The billing page must expose explicit allowance-capacity controls for paid plans.

- Immediate increases call a server route that updates the active Stripe subscription item quantity with proration invoicing.
- Reductions are scheduled for the next billing-period boundary using Stripe subscription schedules.
- Billing summaries must surface any pending reduction with the target purchased-capacity count, effective timestamp, and resulting shared allowance capacity.
- Cancelling a scheduled reduction releases the Stripe subscription schedule and keeps the current quantity in place.
- Active projects remain active when capacity is reduced; the resulting change is to the shared allowance pool, not project existence.
- For internally managed admin-override accounts (`stripe_customer_id = null` on a paid plan), the same billing page controls remain available, but both increases and reductions apply immediately by writing the absolute purchased-capacity quantity directly instead of using Stripe subscription updates or schedules.
- The billing page must show the exact usage-window end in the browser's local timezone together with its UTC equivalent. Calendar-month Free and internal-plan windows remain UTC-authoritative; Stripe-managed paid accounts use the persisted Stripe billing-period boundary.
- An open billing page must refresh just after the usage-window boundary and when the page becomes visible or focused again. Background refresh failures keep the last trustworthy summary visible, late background reads must not overwrite newer checkout, trial, or capacity results, and billing summary reads must bypass browser/intermediary caches.

---

## 5. Stripe Webhook Sync

### 5.1 Core Decision

Stripe is the authoritative source of truth for recurring paid entitlements.

DebugBundle persists a derived entitlement snapshot on the organization record so the product can enforce limits quickly without talking to Stripe on every request.

The product must never use incremental arithmetic like "checkout succeeded, add one capacity unit" for recurring-billing entitlement management.

Instead, the product must continuously derive:
- current paid plan
- current extra capacity quantity
- current billing health / entitlement eligibility

from Stripe subscription state and persist the resulting values to the database.

### 5.2 Set-Based Writes

The sync logic must use set-based writes, not additive deltas.

Good: `additional_capacity_units = 3`
Bad: `additional_capacity_units = additional_capacity_units + 1`

### 5.3 Required Stripe Webhook Events

The billing sync implementation must process at minimum:

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | Initial bridge from checkout to organization — attach `stripe_customer_id` and `stripe_subscription_id` |
| `customer.subscription.created` | Initial subscription entitlement creation |
| `customer.subscription.updated` | Quantity changes, plan changes, status changes, scheduled cancellation |
| `customer.subscription.deleted` | Final entitlement removal |
| `invoice.paid` | Successful renewal — confirm continued service, clear payment-failure state |
| `invoice.payment_failed` | Failed recurring payment — trigger dunning notifications |

### 5.4 Why Each Event Matters

**`checkout.session.completed`**
- First event received for a new customer
- Contains `client_reference_id` (organization_id) for initial linking
- Contains the subscription ID and customer ID to persist
- Must set `stripe_customer_id`, `stripe_subscription_id` on the organization
- Must trigger the initial entitlement recompute

**`customer.subscription.created`**
- Confirms the subscription is live
- Sets initial plan and capacity quantities

**`customer.subscription.updated`**
- Handles all mid-lifecycle changes: quantity changes, plan upgrades/downgrades, status transitions
- This is the primary entitlement recompute trigger

**`customer.subscription.deleted`**
- Subscription fully removed — revert to free plan, zero extra capacity units
- Must trigger downgrade confirmation email

**`invoice.paid`**
- Confirms successful billing for a renewal cycle
- Drives renewal-success email notification
- Clears any previous payment-failure state

**`invoice.payment_failed`**
- Signals failed recurring payment
- Drives payment-failure notification email
- Starts dunning flow (payment failure → reminder → eventual downgrade)

### 5.5 Webhook Route

The API must expose: `POST /v1/billing/stripe-webhook`

This route must:
1. Read the raw request body (not JSON-parsed — Stripe signature verification requires raw bytes)
2. Verify the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`
3. Parse the verified event
4. Resolve the target organization from event metadata
5. Check idempotency (skip already-processed events)
6. Process the event and recompute entitlements
7. Persist the processed event record
8. Enqueue any required notification side effects (emails)
9. Return `200` on success, `400` on signature failure

This route must NOT require a browser session or member token. It is a server-to-server Stripe callback.

Hosted Stripe accounts must have a webhook endpoint configured for `https://api.debugbundle.com/v1/billing/stripe-webhook` with at least the events listed in §5.3. The endpoint signing secret must match `STRIPE_WEBHOOK_SECRET` in the hosted API runtime environment.

### 5.6 Idempotency

Billing event processing must be idempotent.

Replaying the same Stripe event must not double-apply changes.

The handler should store processed Stripe event IDs in a `processed_billing_events` table (or equivalent). Before processing, check if the event ID exists. After processing, insert the event ID.

### 5.7 Organization Resolution from Webhook Events

Different event types carry organization context differently:

| Event | Resolution Path |
|-------|----------------|
| `checkout.session.completed` | `client_reference_id` → `organization_id`, or `metadata.organization_id` |
| `customer.subscription.*` | Subscription `metadata.organization_id`, or lookup via `stripe_customer_id` on organizations table |
| `invoice.*` | `customer` field → lookup via `stripe_customer_id` on organizations table |

The handler must support both paths and fail gracefully if resolution fails (log warning, return 200 to Stripe to prevent retry storms, but do not apply state changes).

---

## 6. Entitlement Rules

### 6.1 Extra Capacity Rule

`additional_capacity_units` must represent the currently valid quantity of paid extra capacity units.

It must be derived from the active Stripe subscription item quantity for the extra-capacity price associated with the organization's plan.

The API must reject user-supplied extra-capacity targets outside the range `0..99` before mutating Stripe subscriptions or schedules.

### 6.2 Product Capacity Rule

Effective capacity:

```
included_capacity_units + additional_capacity_units
```

The same value expands pooled monthly allowance capacity (each capacity unit carries a full allowance bucket), including the separately metered monthly analytics event, session, retained-journey-sample, and generated-analytics-bundle allowances on paid tiers. Free receives a fixed, non-expandable preview of 5,000 analytics events, 1,000 sessions, 100 retained journey samples, 3 generated analytics bundles, and 1 saved funnel. Fixed tier capabilities such as saved funnels, custom dimensions, retention windows, and feature availability do not multiply with capacity units. Controlled custom-dimension caps are 1 on Free, 3 on Solo, 8 on Team, and 20 on self-host.

Allowance boundaries are inclusive of the defined limit: work that changes usage from `limit - 1` to `limit` is permitted, while only subsequent units are rejected or suppressed. Batched and fan-out paths must consume at most the exact remaining whole units in deterministic order rather than rejecting the entire batch and stranding available capacity. Meters backed by a durable reservation claim must enforce that boundary atomically. For counters derived from durable accepted records, simultaneous requests must not be handled with a conservative under-admission margin; a small concurrency overage is preferable to rejecting while the authoritative usage snapshot remains below the advertised limit, and that overage must remain visible in actual usage. Operational limit-reached notifications must use actual post-admission usage and must not be queued while `used < limit`.

### 6.3 Recurring Billing Rule

Recurring payments must be able to both preserve and revoke paid entitlements.

If a subscription falls out of an entitlement-eligible state, paid capacity units must eventually be reduced accordingly.

### 6.4 Entitlement Eligibility Mapping

**Entitlement-eligible subscription states** (keep paid entitlements active):
- `active`
- `trialing`

Stripe `trialing` here refers to Stripe-managed subscription state, not DebugBundle's internal no-card trial. Internal no-card trials are represented by `billing_state = 'trialing'` together with `stripe_customer_id = null`.

**Non-eligible subscription states** (remove paid entitlements):
- `canceled`
- `incomplete_expired`
- `unpaid`

**Grace-policy states** (require explicit product decision):
- `past_due` — keep entitlements active but notify owner, start dunning flow
- `incomplete` — initial payment not yet confirmed, keep limited grace

### 6.5 Grace Period Policy (V1)

For V1:
- `past_due`: keep all entitlements active for the Stripe default retry window (typically ~3 weeks across multiple retry attempts). Send payment-failure and reminder emails during this window. If the subscription transitions to `unpaid` or `canceled` after retries, then revoke entitlements.
- `incomplete`: keep base plan access, but treat extra capacity as pending until payment succeeds. If payment fails and transitions to `incomplete_expired`, revert to free.

---

## 7. Sync Algorithm

### 7.1 Recompute Inputs

On every relevant Stripe webhook event, derive from the subscription object:
- current subscription status
- current plan price → internal plan name mapping
- current quantity on the extra-capacity subscription item (0 if no extra-capacity item)
- current period start date
- current period end date

### 7.2 Recompute Outputs

Write to the organization record:
- `plan` — mapped from subscription plan price
- `additional_capacity_units` — quantity from extra-capacity subscription item
- `billing_state` — derived from subscription status
- `billing_period_starts_at` — from subscription current period start
- `billing_period_ends_at` — from subscription current period end
- `last_billing_sync_at` — current timestamp
- `last_billing_event_id` — Stripe event ID
- `trial_converted_at` — first paid-entitlement sync timestamp when `trial_used_at` was already set and the resulting paid plan is not `free`

### 7.3 Write Rules

- Always use set-based writes
- A single subscription update event triggers a full recompute of all entitlement fields
- The write must be atomic (single UPDATE statement or transaction)

### 7.4 Subscription Deletion / Cancellation

When a subscription is deleted:
- `plan` → `"free"`
- `additional_capacity_units` → `0`
- `billing_state` → `"canceled"`
- `stripe_subscription_id` → retain (audit trail) or set null (design choice — retain is preferred)
- Trigger downgrade confirmation email

### 7.5 Out-of-Order Event Handling

The sync layer must assume events can arrive out of order.

When ordering is ambiguous, prefer fetching the current subscription state from the Stripe API rather than trusting incremental local transitions. This is acceptable because webhook processing is not latency-sensitive.

---

## 8. Admin Override Path

For support remediation, development, and manual backfills, a minimal internal admin override must exist.

Requirements:
- Explicit audit logging
- Explicit operator scope (admin/support role, not regular users)
- Absolute capacity quantity input, not increment/decrement
- Must not become the primary production source of truth
- Must log who made the change and why

For V1, this can be a CLI command or internal API endpoint. It does not need a UI.

Implementation:
- Configure runtime operator emails with `BILLING_ADMIN_OVERRIDE_EMAILS` as a comma-separated list.
- In the hosted deploy workflow, the private `HOSTED_BILLING_ADMIN_OVERRIDE_EMAILS` secret should render into runtime `BILLING_ADMIN_OVERRIDE_EMAILS`.
- `POST /v1/admin/billing/override` accepts optional `organization_id` (defaults to the operator's own organization), absolute `plan`, absolute `additional_capacity_units`, and `reason`.
- The route requires an authenticated operator whose email is present in `BILLING_ADMIN_OVERRIDE_EMAILS`.
- The route writes the effective organization entitlement snapshot directly, clears Stripe customer/subscription linkage, marks paid overrides with `billing_state = 'admin_override'`, and audit-logs the operator, target organization, absolute entitlement, and reason.
- Admin overrides do not reset no-card trial eligibility and must not clear `trial_used_at`.
- When an allowlisted operator signs into their own free organization, DebugBundle should automatically seed that organization to an internally managed Team plan with zero additional capacity units so operator accounts do not need a manual bootstrap override.
- The Billing page treats paid plans with no `stripe_customer_id` as internally managed, suppresses Stripe checkout/portal actions, and keeps the existing capacity-management controls available with immediate internal updates.
- Review access may additionally bootstrap a reviewer-owned free organization to an internally managed Team plan through a secret-gated browser bootstrap route. The route must only mint a short-lived review cookie, the actual plan upgrade must still happen server-side through the same admin override primitive, and the cookie must be cleared after session resolution.

---

## 9. Failure Handling

### 9.1 Webhook Retries

Stripe webhook delivery retries are expected. Duplicate deliveries must be harmless due to idempotency (§5.6).

### 9.2 Out-of-Order Events

Handled by preferring recompute from latest Stripe state (§7.5).

### 9.3 Temporary Stripe/API Failures

Webhook handling should fail closed for state changes it cannot verify.

If the system cannot safely determine effective entitlement state, it must not invent a new capacity count. Return `500` to Stripe so it retries later.

### 9.4 Organization Resolution Failure

If a webhook event cannot be mapped to an organization:
- Log a structured warning with the Stripe event ID and customer ID
- Return `200` to Stripe (prevent retry storm for permanently unresolvable events)
- Do not apply any state changes

### 9.5 Observability

Billing sync and no-card trial lifecycle must be observable with:
- Structured logs for every processed event (event type, organization ID, resulting state)
- Structured logs for failures (resolution misses, Stripe API errors)
- Structured logs for trial lifecycle actions (start, reminder queued, expired, converted, skipped)
- A `billing.plan_downgrade_cleanup` system audit record whenever a lower-plan write suspends, terminalizes, or invalidates paid-tier setup. The audit metadata includes `previous_plan`, `target_plan`, `trigger_source`, and `cleanup_summary` counts by feature category.
- Metrics for webhook processing latency and error rates (deferred to operational monitoring phase)

---

## 10. Billing Lifecycle Emails

The billing system must emit customer-facing emails for important transitions.

See `/spec/system-emails.md` for the canonical email inventory, templates, and trigger rules.

At minimum, billing webhook processing must trigger:
- No-card trial started
- No-card trial ending soon (7 days)
- No-card trial ending soon (1 day)
- No-card trial expired
- No-card trial converted
- Purchase confirmation (on `checkout.session.completed`)
- Renewal success (on `invoice.paid` for recurring invoices)
- Payment failure (on `invoice.payment_failed` when the current subscription is past due; an unapplied pending upgrade leaves the paid base plan unchanged and uses its hosted invoice recovery)
- Payment failure reminder (on repeated `invoice.payment_failed` within dunning window)
- Entitlement downgrade warning (when `past_due` and approaching final retry)
- Entitlement downgrade confirmation (on subscription deletion or transition to `canceled`/`unpaid`)
- Plan change confirmation (on current applied plan change in `customer.subscription.updated` or its `invoice.paid`, independent of delivery order)
- Capacity quantity change confirmation (on extra-capacity quantity change in `customer.subscription.updated`)

---

## 11. Dependencies

### 11.1 NPM Package

The `stripe` npm package must be added to the API app for:
- Checkout Session creation
- Billing Portal Session creation
- Webhook signature verification
- Subscription object retrieval (for out-of-order recompute)

### 11.2 Database Migration

A migration must add the new billing columns to organizations:
- `stripe_subscription_id` (text, nullable)
- `billing_state` (text, nullable)
- `billing_period_starts_at` (timestamptz, nullable)
- `billing_period_ends_at` (timestamptz, nullable)
- `last_billing_sync_at` (timestamptz, nullable)
- `last_billing_event_id` (text, nullable)
- `trial_plan` (text, nullable)
- `trial_started_at` (timestamptz, nullable)
- `trial_ends_at` (timestamptz, nullable)
- `trial_used_at` (timestamptz, nullable)
- `trial_converted_at` (timestamptz, nullable)
- `trial_expired_at` (timestamptz, nullable)

A `trial_lifecycle_events` table must exist for worker-side reminder/expiry/conversion dedupe:
- `id` (uuid, primary key)
- `organization_id` (uuid, not null)
- `event_type` (text, not null)
- `dedupe_key` (text, not null)
- `created_at` (timestamptz, not null, default now())

`operational_email_deliveries` must support organization-scoped lifecycle mail:
- `project_id` nullable for trial lifecycle emails
- `kind` includes `trial_started`, `trial_ending_soon`, `trial_expired`, and `trial_converted`

A `plan_cleanup_tasks` table exists as a reserved compatibility surface for external cleanup side effects that cannot be completed transactionally. The current preserve-and-suspend downgrade flow does not emit or process hosted-improvement object deletion tasks:
- `id` (uuid, primary key)
- `organization_id` (uuid, not null)
- `project_id` (uuid, not null)
- `cleanup_type` (text, not null) — currently `delete_improvement_bundle_objects`
- `attempt_count` (integer, not null, default 0)
- `last_error` (text, nullable)
- `next_attempt_at` (timestamptz, not null, default now())
- `completed_at` (timestamptz, nullable)
- `created_at` (timestamptz, not null, default now())
- `updated_at` (timestamptz, not null, default now())

A `processed_billing_events` table must be created:
- `event_id` (text, primary key) — Stripe event ID
- `event_type` (text, not null)
- `organization_id` (uuid, nullable) — resolved organization
- `processed_at` (timestamptz, not null, default now())

Note: `stripe_customer_id` and `additional_capacity_units` already exist on organizations.

Deploy/runtime rule:
- ordered forward migrations must run before API or worker code that reads trial fields or schedules trial lifecycle work
- readiness/startup checks must fail closed when required trial migrations are missing

---

## 12. Implementation Sequence

### Phase A: Foundation (must be done first)
1. Add `stripe` npm dependency to `apps/api`
2. Database migration for new organization columns + `processed_billing_events` table + no-card trial metadata + `trial_lifecycle_events`
3. Price-to-plan mapping configuration module
4. Stripe client factory (reads `STRIPE_SECRET_KEY`, creates typed Stripe client)

### Phase B: Checkout & Portal (replaces static URLs)
1. Replace `createCheckoutLink` with dynamic Checkout Session creation
2. Replace `createPortalLink` with dynamic Portal Session creation
3. Update billing routes to use new dynamic session creation
4. Remove legacy static URL env vars from billing-links.ts

### Phase C: Webhook Sync
1. Webhook route with raw body parsing and signature verification
2. Organization resolution from event metadata
3. Idempotency check (processed_billing_events table)
4. Entitlement recompute logic for each event type
5. Set-based organization update

### Phase D: Emails & Notifications
1. Billing email templates (purchase confirmation, renewal, failure, no-card trial lifecycle, etc.)
2. Durable worker scheduling for no-card trial reminders, expiry, and conversion email queueing
3. Email trigger integration in webhook event handlers
4. Dunning flow (payment failure → reminder timing)

### Phase E: Testing & Hardening
1. Unit tests for entitlement recompute logic
2. Unit tests for organization resolution
3. Unit tests for idempotency
4. Integration test: checkout → webhook → entitlement expansion → project creation unblocked
5. Integration test: subscription cancellation → entitlement revocation

---

## 13. Test Requirements

### 13.1 Unit Tests

- Stripe event signature verification
- Organization mapping resolution from each event type
- Idempotent duplicate event handling (process once, skip second)
- Entitlement recompute: quantity increase
- Entitlement recompute: quantity decrease
- Entitlement recompute: plan upgrade
- Entitlement recompute: plan downgrade / cancellation
- Entitlement recompute: `invoice.paid` clears failure state
- Entitlement recompute: `invoice.payment_failed` sets failure state
- Price-to-plan mapping with unknown price IDs

### 13.2 Integration Tests

1. Project creation remains available on paid plans after capacity changes
2. Billing sync updates `additional_capacity_units`
3. Billing summary capacity increases immediately
4. Active-project counts remain accurate after the capacity change
5. Pooled monthly allowance increases from the same capacity update
6. Subscription cancellation reverts plan to free, capacity units to 0
7. Duplicate Stripe event processing is harmless

### 13.3 Checkout Session Tests

1. Checkout creates a valid Stripe session with correct metadata
2. Checkout includes `client_reference_id` = organization_id
3. Checkout reuses existing `stripe_customer_id` when present
4. Portal creation requires existing `stripe_customer_id`

### 13.4 Email Tests

Billing webhook processing triggers the correct lifecycle emails for:
- First purchase confirmation
- Renewal success
- Payment failure
- Downgrade warning
- Downgrade confirmation

---

## 14. Cross-References

- Tier pricing and allowance numbers: `/spec/product.md` section 13
- System email inventory: `/spec/system-emails.md`
- Product overview and pricing philosophy: `/spec/product.md` §13
- Requirements: `/spec/requirements.md` FR-BIL-01 through FR-BIL-08
- Auth and session model: `/spec/auth-architecture.md`
- Domain invariants for billing enforcement: `/rules/domain-invariants.md`

### Current-period selection correction (local candidate)

Webhook and checkout-return synchronization share `stripe-billing-period.ts`. Read current subscription-item periods first (Clover), then legacy top-level subscription fields, then valid non-proration invoice lines and invoice envelope fields. Do not override the result with an `invoice.paid` envelope: an initial invoice can have equal top-level start/end. Retrieve the current subscription and preserve the same real month in either webhook order. This corrects future snapshots; existing malformed periods need an explicit, scoped reconciliation after a verified release, with no payment replay.


---

## Local checkout and period hardening — 22 October 2026

This is a local, uncommitted candidate originating from hosted source `a4e0ffcab75346818bbab06b0386cb9bffc48a56` and transferred onto current main `fc5f3b1dab0f3cea4cd1efd80cbca1cc1160755d` with newer documentation preserved. It is not a release receipt. The owner explicitly requires local work and separate consent before publication or deployment. Do not run production billing canaries or act on customer accounts from this document.

## Scope and behaviour

- A short PostgreSQL transaction reserves one checkout attempt per organisation before Stripe is called. Repeated/concurrent requests reuse the open session or the same persisted parameters and Stripe idempotency key. Completed/uncertain attempts cannot silently become another charge. Only a provider-confirmed expired session or a completed session tied to its exact provider-confirmed terminal subscription permits replacement.
- New sessions expire in one hour and request supported 3DS authentication. Provider calls have an eight-second timeout with no automatic network retries; a subsequent explicit request safely replays the reserved attempt. The existing member limit is supplemented by five organisation requests/minute and ten trusted-client-IP requests/minute.
- Webhook/checkout-return synchronisation shares current-period selection: Clover subscription items, legacy subscription fields, then valid non-proration invoice fallbacks. A zero-length initial invoice envelope cannot erase the actual month. Existing entitlement policy is preserved.
- Forwarded IPs stay disabled by default. Explicit immediate-peer IPs are accepted; broad trust/CIDRs and further hops are rejected. Runtime validates settings before opening dependencies. Existing CORS, session/CSRF, owner and OAuth/MCP host isolation remain in place.
- Migrations `202610220001_add_billing_checkout_attempts`, `202610220002_add_billing_subscription_operations`, `202610220003_add_billing_lifecycle_notifications` and `202610220004_add_billing_plan_change_operations` are additive and must precede dependent runtime activation. Cancellation retains checkout reservations; explicit provider-confirmed terminal-session reconciliation preserves resubscription without erasing newer ambiguous attempts. One internal record per organisation contains provider routing/existing billing email, no card data or credentials; account deletion cascades it.

## Material limits before any release

The replacement Solo-to-Team path is implemented locally using the existing subscription and a payment-pending proration invoice, preserving extra-capacity quantity and serializing capacity mutations. The former second-subscription path remains blocked. Local concurrency, failure and webhook-ordering regressions are distinct from hosted authentication and invoice-return evidence. The authorised test-mode browser journeys are recorded below; production deployment and customer acceptance remain separate gates. Scheduled capacity reductions must be explicitly cancelled before upgrading.

A different target while an attempt is open returns `409 checkout_in_progress`; it can finish or expire before another target starts. If a pending provider response cannot be reconciled, retain the reservation for operator review. Never rotate an ambiguous attempt merely because it is old.

The patch does not expire legacy Stripe URLs or alter Radar, CVC/AVS rules, subscriptions, payments or existing stored billing snapshots. Requesting 3DS does not guarantee a challenge or protect unsupported cards. A separately reviewed CVC-failure rule and legacy-session reconciliation remain operational work. No new paid product or account-wide address/country block is proposed.

Provider references: [Stripe 3DS behaviour](https://docs.stripe.com/payments/3d-secure/authentication-flow), [card-testing controls](https://docs.stripe.com/disputes/prevention/card-testing), and [Fastify proxy trust](https://fastify.dev/docs/latest/Reference/Server/). These support the integration choices and limitations; they do not prove a live outcome.

## Local verification

Use `make test-billing-checkout-integration` for a disposable PostgreSQL instance, without host ports or persistent volumes. It verifies concurrent requests through independent stores and the real API billing dependency, organisation separation, mutation/checkout fencing, terminal-session resubscription, delayed cancellation, both additive/repeated migrations, fail-closed readiness and a pre-ledger upgrade preserving a paid snapshot. Other existing development stacks are untouched.

Focused API tests cover uncertain responses with identical idempotency, both initial-webhook orders, supported 3DS parameters, owner/session controls, dedicated rate rejection/audit, untrusted forwarding, runtime startup and existing OAuth/MCP isolation. Typecheck and focused lint are required. Local tests do not establish a hosted Stripe/3DS/customer journey or live rollout success.

## Rollout prerequisites

First review the exact local paid-plan candidate and independently verify the hosted authentication/invoice-return journey in an authorised test environment. Reconcile legacy open checkouts through a separately authorised Stripe interface. Review the exact source diff and all four migrations, preserve a verified backup and previous immutable runtime, then apply the migrations before dependent activation. Activate the notification-compatible worker and retire incompatible workers before enabling the new API producer; preserve compatible processing during rollback. Configure only independently verified immediate proxy addresses after checking the listener and header-overwrite boundary. Independently read back deployed provenance, readiness, billing periods and provider delivery; reconcile the known malformed snapshot without replaying a payment. Leave the additive table in place if rolling application code back. No part of this paragraph is permission to execute it.


### Scheduled paid plan changes (FR-BIL-09)

`GET /v1/billing/plan-change` returns `{pending_change:null|{schedule_id,target_plan,effective_at,additional_capacity_units}}`. `POST /v1/billing/plan-change/preview` with `{}` returns a signed ten-minute quote containing zero due now, estimated recurring total/tax/currency, effective date and retained units. `POST /v1/billing/plan-change` requires `{confirmation_token}`. `DELETE /v1/billing/plan-change` requires the exact `{schedule_id}`. All require an owner; browser access requires verified email and writes require CSRF. Existing management rate limits apply. These separate responses preserve older strict billing-summary clients.

The plan schedule uses `from_subscription`, stable create/update keys, `end_behavior=release`, no immediate proration and two monthly phases. Current Team prices remain until the authoritative common item-period end. The next phase uses Solo plan/add-on prices and the same purchased quantity, item discounts/tax rates and subscription discounts/tax settings. Current subscriptions must be active, paid, automatic collection, complete/known monthly items and free of conflicting schedules, cancellation or pending payment. No entitlements change on schedule creation. Stripe's current subscription, read through the existing fenced webhook/return paths, remains authoritative.

The shared durable reservation stores plan scheduling/cancellation as `plan_schedule`/`plan_cancel` after additive forward migration 202610220004. Confirmation is bound to current item/period/settings and rechecks the quote before preparing. Prepared requests retain the original quote and commands. Preview can return `resume_required:true` with that exact confirmed quote after a reload; its expiry does not authorise a new operation. Stop unknown replay at 23 hours. Exact applied/released provider state can complete an old reservation without replay. Never delete a reservation merely because it is old.

New downgrade confirmations are bound to the current durable operation revision. The store compares that revision under the organization lock, so a delayed confirm cannot recreate a change after another tab cancelled it. Unprepared and provider-voided operations retain a completed revision when retired; they do not erase confirmation history. Identical prepared retries still recover their original operation and quote.

Cancelling releases only the supplied owned pending schedule after full phase validation; it does not cancel the subscription or remove Team access. Other capacity/plan mutations reject future schedules. After the final managed phase has already applied, the next owner-requested upgrade, downgrade or capacity change may release that exact owned schedule, with a stable key recorded in its operation, before applying its new change. No future phase can be discarded by this path. Renewal and subscription events use the persisted previous plan so both orders send the plan transition confirmation.

Use `debugbundle billing plan-change status|preview`, `schedule --confirmation-token <token>` or `cancel --schedule-id <id>`. The source `billing_plan_change` MCP tool provides the same actions (the independently published 1.17.0 CLI/MCP packages require a later release for these additions); agents must present the price/date/capacity/feature impact and obtain explicit confirmation before scheduling. The synthetic developer API supports this flow without contacting Stripe.

`make billing-stripe-test` is an explicit provider-validation target. It requires an ignored `.local-notes/stripe-test.env` with `STRIPE_TEST_KEY` and `STRIPE_TEST_ACCOUNT`; never put keys in command arguments, tracked files or logs. The runner refuses live credentials, verifies account and test balance before writes, creates only labelled disposable objects and records a private receipt before scoped cleanup. It does not change account/Portal/Radar settings or use existing customers. Provider API results, disposable PostgreSQL integration and hosted browser acceptance are distinct gates. No local result authorises release.

`make billing-stripe-hosted-test` waits for a browser-completed 3DS payment of the original upgrade invoice; it does not pay through the API as a substitute. `make billing-stripe-browser-test` exercises the actual dashboard and billing API against disposable PostgreSQL, with test-only CLI webhook forwarding. It uses an isolated localhost hostname/session, loopback ports 5297/3297 and the existing pinned frontend dependencies. A synthetic account starts free, verifies that first purchase is blocked, then receives an eight-day-old no-card trial in its disposable database before Checkout; the runner follows that organization's exact durable Checkout reservation to discover and clean up the customer it actually created. It verifies paid Checkout return, same-subscription upgrade payment, dashboard focus refresh, signed webhook receipts and valid persisted periods. Unrelated services fail closed and no outbound email worker runs. The runner never uses an existing database, customer, saved payment method or live credential. Private receipts retain fixture identities and cleanup results. Provider-hosted proof does not prove production deployment or customer legitimacy.

### Validation and hosted deployment checkpoint — 22 October 2026

The full 100-shard release unit suite passes 4,636 tests, plus 25 disposable PostgreSQL integration cases and 41 site tests. Typecheck, lint/format, dashboard build and the unchanged coverage gate for all 71 billing-range changed source files pass. Test-mode provider checks cover paid/declined/authentication recovery, taxes/discounts/proration, retained capacity, scheduled downgrade renewal, subsequent upgrade and capacity changes. Edge completed a failed then successful 3DS attempt on the same invoice. The actual local dashboard/API/database completed direct paid Checkout with 3DS, return confirmation, a same-subscription upgrade through the separate invoice tab, automatic focus refresh and real signed test webhook delivery. No production or customer-legitimacy conclusion follows.

The existing private image rollout migrates before candidate startup, but promotes API traffic before activating the candidate worker. A first release that produces `billing_lifecycle` messages requires either a prior compatible-worker bridge release or reviewed worker-first orchestration with compatible-worker rollback. Do not execute the unchanged one-step rollout for this candidate. The chosen release sequence deploys the core 1.18.1 compatibility worker before the core 1.19.0 API producer and retains the bridge for rollback. Hosted image installation uses the frozen reviewed lockfile; explicit immediate-proxy trust is configured only after separate boundary approval. Actual deployment evidence belongs in STATUS.md and the release checkpoint.

Hosted core 1.19.0 is deployed after the independently verified 1.18.1 compatibility bridge. Production readback confirms the exact source/version, healthy API and processing worker, all 63 migration checksums, new billing tables/notification constraint, approved immediate-proxy trust, exact served SPA and retained bridge images. Existing readiness monitoring passes with no new or changed incidents in the scoped API project. No production payment canary or manual customer notice was used. This does not establish containment or validate individual customers. Eight historic malformed billing periods remain unrepaired; their separate proposal preserves counters and requires fresh provider/row/usage checks plus explicit owner consent. Existing hosted links, CAPTCHA and automated billing monitoring remain follow-ups. The revised browser harness incorporating the seven-day fixture has not been rerun; prior hosted test evidence predates that policy.
