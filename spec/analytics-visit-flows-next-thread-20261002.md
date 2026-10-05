# Public flow continuation — 2026-10-04

Work in `/Users/owenfar/Developer/debugbundle` on `update/visit-flows`.
Follow AGENTS.md and its required read order, then STATUS.md, analytics-scope-reset-20261002.md,
analytics-visit-flows-plan-20261002.md, analytics-public-flows-20261003.md, and analytics-preservation-20261002.md.

Complete/review only the customer-generic acquisition and activation workflows. The internal-only local
candidate is superseded and needs no compatibility shims. Customer projects can configure site→blog,
site→auth→login→app and explicit custom steps through the same project flow contract. Do not use
DebugBundle's accounts/incidents as generic customer outcomes. DebugBundle is an ordinary consumer.

Keep the expanded `update/analytics` checklist parked. Use Docker-backed Make targets, isolated disposable
services, no browser/screenshots, no public consent UI/marketing changes, and no million-visit load test.
User design approval is already provided. Preserve published contracts, existing debug capture/auth and
production migration safety. No commit/push/publish/deploy/production change without action-specific approval.
Current evidence and pending release/adoption details are in STATUS.md; do not reuse old internal-candidate
counts as proof for the revised implementation.
