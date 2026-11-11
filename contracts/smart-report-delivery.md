# Smart Report email delivery

Applies to FR-BUS-05 and AC-BUS report delivery. This is a separate path from the existing weekly digest; its recipients and settings are unchanged.

- The only body is a bounded overview rendered from the saved, validated canonical report. Templates escape all text. There are no AI calls, PDF attachments, public artifact links, model-provided destinations or arbitrary email recipients.
- Each frozen recipient identity has one durable delivery per run. The actual saved creator must retain the accepted report product entitlement, current management of every frozen origin and valid privacy/Owner-review state. The recipient must be verified and currently read every frozen origin. A combined report is either sent whole or withheld.
- Recheck current shared and recipient personal email suppression, pauses and discarded history for every selected project immediately before sending. Reports use their own saved schedule; generic alert daily grouping does not alter a report's facts or produce another report.
- Reserve one existing notification allowance unit for each recipient send under the current monthly billing allowance window. Confirmation charges it once; definite rejection releases it. Sending and uncertain outcomes hold it conservatively. Deleting the report does not refund a provider-accepted or uncertain delivery. Report generations remain a separate allowance.
- Reuse the existing Postgres worker job mechanism and the bounded report lane. Persist a send intent before the provider call. Use one SDK attempt and a maximum twenty-second provider wait, without holding a database lock across object reads, rendering or sending.
- A queued job may retry preparation while no send intent exists. A sending job recovered after a crash becomes uncertain. Never send automatically again after a provider acknowledgement may have been lost. Accepted receipts settle independently of current permission to publish. They do not claim inbox delivery.
- Receipts store identities, state, allowance and minimal acceptance evidence, never full report bodies or email addresses. Current report readers may inspect safe recipient delivery states. Removing a recipient, project, report or privacy consent stops unsent work; already delivered email cannot be recalled.
- Missing SES configuration never breaks debugging or PDF archives. Email delivery is tested with synthetic fixtures and mocked providers; live sending requires its own authority.

The overview template is `packages/email/src/smart-report-email.ts`. The compatible SES transport extraction preserves the old `createSesEmailTransport` retry/error contract. `createSesReportEmailTransport` uses receipt-aware, single-attempt report semantics and safe error classifications. `report-email-store.ts` coalesces the bounded recipient outbox, owns the actual durable job/send intent, reserves notification usage and settles provider evidence. `report-email-claim.ts` rechecks the saved creator, current verified recipient, complete frozen scope and personal/shared policy. The existing serial report lane rotates PDF, generation and email fairly, with empty delivery polls backing off five seconds. The reporting switch stops generation and email egress while archives/PDF and maintenance remain available. Unconfigured mail waits only through its twenty-four-hour delivery deadline, then becomes visibly expired. Public API/client/CLI/ordinary MCP and the dashboard expose safe status reads; no provider receipt write or automatic uncertain resend is exposed. Candidate forward migration 014, its ledger/readiness guards and independent cleanup precede runtime use. Local integrated qualification is recorded in [the qualification record](../spec/business-tier-qualification-20261108.md); live release/provider acceptance remain separate.

New Business purchase admission defaults closed. `BUSINESS_SALES_ENABLED=true`
also requires reporting to be enabled and its selected AI provider/profile to be
configured in API composition. Fresh Business checkout, upgrade preview/confirmation
and a new scheduled move to Business share this gate. Solo/Team admission and
existing Business interval changes, subscriptions, renewals, capacity, report
archives, accepted payment recovery and financial reconciliation remain available.
The switch does not revoke entitlements, cancel provider checkouts, invalidate
already admitted payments or alter scheduled operations. No provider catalogue
or live setting is changed by this local implementation.

Intentional Solo/Team factual reports use the same delivery path and show that AI analysis is not included. Their generation reserves no AI money or provider request; email still uses the existing notification allowance and single-send receipts. Upgrades retain saved factual mode. See [Smart Products](../spec/smart-products.md).
