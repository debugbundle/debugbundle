# Billing

Version: v1
Last updated: 2026-06-04

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

Pricing amounts and tier definitions live in `/spec/tiers.md` (source of truth for pricing numbers). This file focuses on how those tiers are implemented through Stripe and enforced in the product.

GitHub Marketplace listing support is related but distinct. In the current model, GitHub Marketplace webhook events are tracked for listing-originated purchase/subscription state and install attribution, while Stripe remains the authoritative source of truth for paid DebugBundle entitlements.

---

## 2. Stripe Product Catalog

### 2.1 Products to Create in Stripe Dashboard

DebugBundle requires the following Stripe products:

**Plan subscriptions (one per paid tier):**

| Product | Description | Billing |
|---------|-------------|---------|
| Solo Plan | DebugBundle Solo — 3 included capacity units, solo developer tier | $2.99/month recurring |
| Team Plan | DebugBundle Team — 15 included capacity units, collaboration tier | $19/month recurring |

**Extra capacity add-ons (one per paid tier):**

| Product | Description | Billing |
|---------|-------------|---------|
| Solo Extra Capacity | Additional capacity unit for Solo plan | $0.99/month recurring, quantity-based |
| Team Extra Capacity | Additional capacity unit for Team plan | $1.99/month recurring, quantity-based |

### 2.2 Price Configuration

Each product must have a single default monthly-recurring Price in Stripe.

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

Legacy static URL variables (`STRIPE_SOLO_CHECKOUT_URL`, `STRIPE_TEAM_CHECKOUT_URL`, `STRIPE_CUSTOMER_PORTAL_URL`) remain local/manual fallback scaffolding only and must not be the hosted production path.

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

---

## 4. Checkout Flow

Before Stripe checkout begins, eligible Free organizations may start a 30-day no-card Solo or Team trial from pricing, billing, API, CLI, or MCP. Checkout remains available during an active trial so the organization can convert to paid before expiry.

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
- Active no-card trials are not required to expire first.

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

Plan changes between Solo and Team should be handled through the web app checkout flow, not through the portal, to maintain explicit upgrade path control.

### 4.6 In-App Capacity Management

The billing page must expose explicit allowance-capacity controls for paid plans.

- Immediate increases call a server route that updates the active Stripe subscription item quantity with proration invoicing.
- Reductions are scheduled for the next billing-period boundary using Stripe subscription schedules.
- Billing summaries must surface any pending reduction with the target purchased-capacity count, effective timestamp, and resulting shared allowance capacity.
- Cancelling a scheduled reduction releases the Stripe subscription schedule and keeps the current quantity in place.
- Active projects remain active when capacity is reduced; the resulting change is to the shared allowance pool, not project existence.
- For internally managed admin-override accounts (`stripe_customer_id = null` on a paid plan), the same billing page controls remain available, but both increases and reductions apply immediately by writing the absolute purchased-capacity quantity directly instead of using Stripe subscription updates or schedules.

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

The same value expands pooled monthly allowance capacity (each capacity unit carries a full allowance bucket).

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
- Payment failure (on `invoice.payment_failed`)
- Payment failure reminder (on repeated `invoice.payment_failed` within dunning window)
- Entitlement downgrade warning (when `past_due` and approaching final retry)
- Entitlement downgrade confirmation (on subscription deletion or transition to `canceled`/`unpaid`)
- Plan change confirmation (on plan price change in `customer.subscription.updated`)
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

- Tier pricing and allowance numbers: `/spec/tiers.md`
- System email inventory: `/spec/system-emails.md`
- Product overview and pricing philosophy: `/spec/product.md` §13
- Requirements: `/spec/requirements.md` FR-BIL-01 through FR-BIL-05
- Auth and session model: `/spec/auth-architecture.md`
- Domain invariants for billing enforcement: `/rules/domain-invariants.md`
