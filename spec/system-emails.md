# System Emails

Version: v1
Last updated: 2026-03-19

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

### 4.12 Webhook Auto-Disabled

- Category: operational
- Trigger: webhook auto-disabled after repeated delivery failures
- Recipient: project or organization owner
- Required in v1: yes
- Current implementation status: required by existing product rules

### 4.13 Allowance Warning 80%

- Category: operational / billing-aware
- Trigger: allowance usage reaches 80% for a meter
- Recipient: organization owner
- Required in v1: yes
- Notes: applies to every allowance meter defined in `/spec/tiers.md`

### 4.14 Allowance Limit Reached 100%

- Category: operational / billing-aware
- Trigger: allowance usage reaches 100% for a meter
- Recipient: organization owner
- Required in v1: yes
- Notes: must explain resulting behavior such as rejection, pause, or block

### 4.15 Retention Rotation Notice

- Category: operational
- Trigger: oldest retained bundles are rotated out because retention cap is exceeded
- Recipient: organization owner
- Required in v1: yes
- Notes: should explain that this is expected policy behavior, not corruption

### 4.16 Weekly Report

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

---

## 9. Cross-References

- Billing lifecycle source-of-truth: `/spec/billing.md`
- Tier allowance notification requirements: `/spec/tiers.md`
- Existing auth flows: `/spec/auth-architecture.md`
