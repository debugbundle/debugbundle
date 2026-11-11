# Smart Products release — 11 November 2026

Owner authorised publication, the usual release train and production deployment
of the approved Smart Products, public-site and app refinements. A separate
approval authorises synthetic weekly-review model qualification using the existing
DebugBundle report credential, capped at USD 1 / 40 paid requests, and activation
only if safety and usefulness pass. No other product is included.

## Version selection

- Core 1.25.0: additive factual reports, weekly review APIs and compatible v2 reads.
- Shared types 3.5.0: additive entitlement export and expanded paid-plan capabilities.
- CLI / MCP / OpenClaw 1.23.0: additive review management and factual report reads.
- Public site 1.9.0: Analytics page, product/pricing/docs updates, support chat,
  released-Business article and approved layout/accessibility refinements.
- Existing SDKs and redaction remain unchanged. Developer-plugin pins follow
  successful MCP publication and their own versioning/verification requirements.

## Rollout safety

Three ordered additive migrations precede new API/worker code. Retain legacy v1
projection and installed-client compatibility. First deploy the v2-capable runtime
with report/review generation disabled. Verify all serving readers and migrations.
Deploy the same code again with approved flags so the retained previous stable
runtime also understands v2 before factual reports can be generated. Keep the
Business, MCP, merge and existing report budget settings unchanged otherwise.
Do not roll back to a v1-only reader after v2 artifacts exist. Publish new app/site
assets only after backend acceptance. Existing weekly review settings stay off
until each Owner selects projects and grants consent.

## Qualification and acceptance

The unchanged weekly-review profile passed the synthetic evaluation in
`evals/smart-improvements/qualification-20261111.json`: sixteen paid attempts,
USD 0.0220396 actual cost, USD 0.396 maximum reserved, no customer data.
Five inconsistent synthetic fixtures were corrected and rechecked, with all
original spend retained in the ledger. No-data and invalid-output safety paths
were checked without paid calls. Full guidance uses source symptoms and links;
restricted guidance avoids guessed detail. No UI inspection, action execution,
marketing recommendation or causal guarantee is claimed.

Release workflow receipts, exact commits, migrations and runtime checks will be
recorded here as each stage completes. Until then this document is release prep,
not a claim that deployment has completed.
