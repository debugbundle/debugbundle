# Core 1.30.1 and site 1.11.3 patch release

The owner authorizes review of all pending DebugBundle changes, patch publication,
and production rollout. This release covers shared tab overflow, public homepage
containment, responsive offer wording and homepage loading improvements.

## Distribution decisions

| Distribution                               | Decision | Version       | Reason                                                                                               |
| ------------------------------------------ | -------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Core runtime and dashboard                 | Publish  | 1.30.1        | Shared horizontal tab rows prevent vertical scrollbars and retain line indicators                    |
| Public site                                | Publish  | 1.11.3        | Homepage overflow, responsive offer presentation, smaller hero asset and deferred canvas enhancement |
| CLI, MCP, OpenClaw and portable skill      | Retain   | 1.28.0        | Installed interfaces and instructions have no changes                                                |
| Shared types and redaction                 | Retain   | 3.8.0 / 2.7.1 | Public schemas and redaction behavior have no changes                                                |
| Capture SDKs, adapters and editor packages | Retain   | Existing      | Capture and installed integration behavior have no changes                                           |
| Restricted hosted OpenAI plugin            | Retain   | Existing      | Tool and authorization contracts have no changes                                                     |

## Review and qualification

The tab correction applies to Referrals, project navigation, project analytics and
incident detail through the shared TabsScrollArea. Pill tabs omit the invisible
underline. Line tabs retain their indicator with six pixels of reserved clearance.
Public banners retain phone shorthand, use eligible-plan wording on larger
screens and show programme names or DebugBundle Referral Offer on desktop.
Details retain exact eligibility, one-invoice, trial and renewal conditions.

The homepage shell clips full-bleed artwork. The hero retains its dimensions and
page-scoped high-priority preload, with an 85,488-byte asset. Static evidence
artwork remains server-rendered while the canvas enhancement loads near the
viewport, disconnects observers on unmount and can retry a failed chunk on re-entry.
The manifest remains discoverable through standard metadata. Performance scores
and dependency-tree diagnostics require separate acceptance.

This maps to FR-DOC-10, FR-DOC-11, FR-DOC-13, AC-DOC-13, AC-DOC-14,
AC-DOC-18 and the public affiliate presentation in spec/referral-programmes.md.
There are no database, authorization, provider, commercial policy or public API
changes. Existing migration readiness checks still apply during deployment.

Release source must pass focused checks and repository CI before merging and
publication. Deploy immutable reviewed core/site commits through the private
cloud workflow, preserve runtime switches and credentials, retain the verified
previous runtime, and verify production readiness and exact frontend assets.
Runtime, data preservation and public readback receipts belong to the private
cloud runbook and ignored .tmp/release-1.30.1 evidence directory.
