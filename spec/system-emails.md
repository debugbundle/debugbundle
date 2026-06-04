# System Emails

Version: v1
Last updated: 2026-06-04

---

## 1. Purpose

This file is the source-of-truth inventory for important DebugBundle emails.

It exists so that product-critical emails are not implemented ad hoc or forgotten when new workflows are added.

This file defines:
- which emails exist
- which are mandatory for v1
- what event triggers each email
- who receives each email
- whether an email is transactional, operational, billing, or support-oriented

---

## 2. Principles

- Important account, billing, security, and entitlement emails must be explicitly listed here.
- Email requirements must be tied to product events, not remembered informally.
- Every critical email should have a clear triggering system boundary.
- Emails that affect access, billing, or security are mandatory for v1.

---

## 3. Categories

### 3.1 Auth Emails

Mandatory v1 emails:
- email sign-in code
- project invite

### 3.2 Billing Emails

Mandatory v1 emails:
- no-card trial started
- no-card trial ending soon
- no-card trial expired
- no-card trial converted to paid
- checkout / purchase confirmation
- subscription renewal success
- payment failure
- payment failure reminder
- entitlement downgrade warning
- entitlement downgrade confirmation
- plan change confirmation
- extra capacity quantity change confirmation

### 3.3 Operational Emails

Mandatory v1 emails:
- webhook auto-disabled notification to owner
- allowance warning at 80%
- allowance limit reached at 100%
- retention rotation notice when oldest retained data is removed
- weekly report delivery

### 3.4 Alert Delivery Emails

User-configured alert notifications (not system-triggered):
- incident alert delivery via email channel

These are driven by user-created alert rules, not system lifecycle events.
The alert delivery system already supports email as a channel type and now batches alert emails into 10-second per-project/per-recipient digests to reduce burst noise.
Email alert rules require one explicit recipient address per rule in v1.
They are listed here for completeness but follow a different trigger model.

See `apps/worker/src/runtime.ts` alert delivery for implementation.

### 3.5 Support / Trust Emails

Recommended v1 or shortly after:
- suspicious account or auth-security notice
- billing contact / support receipt for manual intervention

---

## 4. Canonical Email Inventory

### 4.1 Email Sign-In Code

- Category: auth
- Trigger: browser email-code request for signup or login
- Recipient: signing-in user
- Required in v1: yes
- Current implementation status: exists

### 4.2 Project Invite

- Category: auth / collaboration
- Trigger: project invite created successfully
- Recipient: invited email address
- Required in v1: yes
- Current implementation status: exists

### 4.4 Purchase Confirmation

- Category: billing
- Trigger: first successful paid checkout or extra-capacity purchase confirmation
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: confirms plan, capacity quantity, and effective entitlement change

### 4.5 Renewal Success

- Category: billing
- Trigger: recurring invoice paid for an active subscription
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: this should be concise and should confirm continued service / capacity quantity

### 4.6 Payment Failure

- Category: billing
- Trigger: recurring invoice payment failure
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must explain current risk to paid entitlements and next billing attempt if known

### 4.7 Payment Failure Reminder

- Category: billing
- Trigger: payment remains unresolved after initial failure
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: timing policy must be explicit in billing implementation

### 4.8 Entitlement Downgrade Warning

- Category: billing
- Trigger: system is about to remove paid capacity units or plan-derived paid capacity after unresolved billing failure or cancellation
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must explain what capacity will change and when

### 4.9 Entitlement Downgrade Confirmation

- Category: billing
- Trigger: paid capacity units or plan entitlements were actually reduced
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must explain resulting shared allowance-capacity impact and confirm that active projects remain active

### 4.10 Plan Change Confirmation

- Category: billing
- Trigger: plan changed between free / solo / team
- Recipient: organization owner billing contact
- Required in v1: yes

### 4.11 Extra Capacity Quantity Change Confirmation

- Category: billing
- Trigger: extra capacity-unit quantity changed
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: should state previous quantity, new quantity, and effective shared allowance-capacity impact

### 4.12 No-Card Trial Started

- Category: billing
- Trigger: a free organization successfully starts a 30-day no-card Solo or Team trial
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must confirm selected trial plan, exact trial end, and that extra purchased capacity still requires paid conversion

### 4.13 No-Card Trial Ending Soon

- Category: billing
- Trigger: worker-owned lifecycle scheduling reaches the 7-day or 1-day reminder window before trial expiry
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must state remaining days, exact trial end, and the paid-conversion CTA

### 4.14 No-Card Trial Expired

- Category: billing
- Trigger: worker-owned lifecycle expiry downgrades an unconverted no-card trial back to Free
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must explain that the account moved back to Free while keeping projects accessible

### 4.15 No-Card Trial Converted

- Category: billing
- Trigger: a prior no-card trial receives paid Stripe-backed entitlements
- Recipient: organization owner billing contact
- Required in v1: yes
- Notes: must confirm the paid plan now active after trial conversion

### 4.16 Webhook Auto-Disabled

- Category: operational
- Trigger: webhook auto-disabled after repeated delivery failures
- Recipient: project or organization owner
- Required in v1: yes
- Current implementation status: exists

### 4.17 Allowance Warning 80%

- Category: operational / billing-aware
- Trigger: allowance usage reaches 80% for a meter
- Recipient: organization owner
- Required in v1: yes
- Notes: applies to every allowance meter defined in `/spec/local/tiers.md`
- Current implementation status: exists

### 4.18 Allowance Limit Reached 100%

- Category: operational / billing-aware
- Trigger: allowance usage reaches 100% for a meter
- Recipient: organization owner
- Required in v1: yes
- Notes: must explain resulting behavior such as rejection, pause, or block
- Current implementation status: exists

### 4.19 Retention Rotation Notice

- Category: operational
- Trigger: oldest retained bundles are rotated out because retention cap is exceeded
- Recipient: organization owner
- Required in v1: yes
- Notes: should explain that this is expected policy behavior, not corruption
- Current implementation status: exists

### 4.20 Weekly Report

- Category: operational
- Trigger: scheduled weekly-report delivery
- Recipient: configured report channel recipient
- Required in v1: yes
- Current implementation status: exists

---

## 5. Required Recipient Rules

- Account/auth emails go to the directly affected user.
- Organization and billing emails go to the owner or billing contact.
- Project-scoped operational emails may still route to an organization owner in v1 if no richer notification preferences exist yet.

If a dedicated billing contact model is added later, this file must be updated.

---

## 6. Content Requirements

Every critical billing or operational email must include:
- what happened
- which organization / project / allowance it affects
- what behavior changes now apply
- what the recipient can do next

Billing emails should additionally include when relevant:
- plan name
- extra capacity quantity
- next renewal date or retry date if known
- whether service or entitlements are unchanged, at risk, or already reduced

---

## 7. Delivery Guarantees

- Auth and billing emails are transactional and must be treated as high priority.
- Failure to send critical billing emails must be observable.
- Retries and failure logging for critical emails must be implemented.
- Trial lifecycle emails now use the same durable queued-delivery pattern as operational owner notifications, with dedupe through `trial_lifecycle_events` and retry state in `operational_email_deliveries`.
- Email templates should remain explicit and testable, not inline string assembly in route logic.

---

## 8. Test Requirements

At minimum, test coverage must verify that the system triggers the correct email workflow for:
- email sign-in code delivery
- project invite
- first paid purchase confirmation
- renewal success
- payment failure
- downgrade warning
- downgrade confirmation
- webhook auto-disable
- allowance threshold notifications
- retention rotation notification

### 8.1 Local Review Tooling

- The dev-only review surface at `app.debugbundle.com/__dev/system-emails` must render from the same sample email catalog used by any local preview-send flow.
- The dev-only preview-send route `POST /v1/internal/system-email-previews/send` is owner-only and exists strictly for local/test review workflows.
- Preview-send must deliver the selected sample email to the signed-in owner session email plus any mirrored internal review recipients configured for the local review workflow, and must fail clearly when transactional email transport is not configured.

---

## 9. Cross-References

- Billing lifecycle source-of-truth: `/spec/billing.md`
- Tier allowance notification requirements: `/spec/tiers.md`
- Existing auth flows: `/spec/auth-architecture.md`
