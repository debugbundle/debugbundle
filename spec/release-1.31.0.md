# Core 1.31.0 and site 1.12.0

| Distribution                                        | Decision | Version         | Reason                                                                                                          |
| --------------------------------------------------- | -------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| Core and hosted dashboard                           | Publish  | 1.31.0          | Additive creator analytics and code replacement. Includes dashboard, account and runtime fixes.                 |
| Public site                                         | Publish  | 1.12.0          | Homepage referral landing with anonymous visit confirmation.                                                    |
| CLI and ordinary MCP                                | Publish  | 1.29.0          | Creator analytics, code status and guarded replacement are available to installed clients.                      |
| Portable skill and OpenClaw                         | Publish  | 1.29.0          | The installer pins change and OpenClaw includes the updated ordinary tool catalog.                              |
| Shared types and redaction                          | Retain   | 3.8.0 and 2.7.1 | No shipped schema or redaction changes.                                                                         |
| Capture SDKs, adapters, GitHub Action and WordPress | Retain   | Existing        | No changes to these distributions.                                                                              |
| Codex, Claude Code and Gemini                       | Retain   | Existing        | Their published MCP pins and installed guidance remain compatible.                                              |
| Restricted hosted OpenAI plugin                     | Retain   | Existing        | Reviewer reminders change in core. The restricted tool catalog and submission stay at their published versions. |

Qualify core and site on the exact release branches. Publish the site before
enabling homepage visit markers from the API. Stage API and worker with assets
disabled so the dashboard and new client commands can rely on the new
endpoints. Apply `202611210001_add_referral_link_visits` through the ordered
migration step. Use the existing release workflow with feature settings
preserved. Verify the active and rollback image identities and production
readiness. A rollback to the previous API stays compatible with existing
referral accounting and declines project merges while the new table exists.
Returning to the new API restores that operation.

Publish CLI and ordinary MCP after the new endpoints pass readback. Run the
official MCP Registry and ClawHub follow-through against the exact downloaded
packages. Publish the canonical core release after package verification and
publish the matching dashboard assets. Keep release receipts in the private
hosted runbook. See [the referral rollout checks](referral-programmes-review.md).
