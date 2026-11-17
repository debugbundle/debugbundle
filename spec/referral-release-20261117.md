# Affiliate and pending-work release — 17 November 2026

The owner authorises committing all pending DebugBundle work, merging the main
repositories and running normal release flows. The affiliate article is included
following local blog review. Scope is DebugBundle only; consumer products remain
outside this release.

## Distribution eligibility

| Surface | Decision | Version | Shipped change |
| --- | --- | --- | --- |
| Hosted core | Publish | 1.28.0 | Versioned referral offers, payout preferences, creator emails and browser-session renewal. |
| Public site | Publish | 1.11.0 | Affiliate programme discovery, pricing/offers and introduction article. |
| CLI | Publish | 1.26.0 | New referral/offer and payout-preference commands with delegated operator authority. |
| Standard MCP | Publish | 1.26.0 | Matching schemas and tools; restricted hosted catalogues remain unchanged. |
| OpenClaw companion | Publish | 1.26.0 | Bundled MCP functionality and optional referral/payout tools. |
| Codex developer plugin | Publish | 1.9.0 | Exact MCP pin adopts new tools. |
| Gemini extension | Publish | 1.8.0 | Exact MCP pin adopts new tools. |
| Claude Code plugin | Publish | 1.25.0 | Exact MCP pin adopts new tools. |
| SDKs, shared JS, hosted OpenAI plugin | Retain | Existing | No changed shipped SDK/schema/redaction or restricted hosted tool behaviour. |

## Release sequence and safeguards

1. Run source, build and database checks over all pending work; preserve existing
   migrations, credentials, business/report settings and project-merge activation.
2. Commit reviewed source on dedicated branches and qualify CI. Publish eligible
   CLI/MCP distributions before advertising new exact plugin pins on main.
3. Merge reviewed core/site/cloud source and release their selected versions.
4. Deploy the first offer-aware API/worker with new programmes disabled. Forward
   migrations must precede new consumers. Prepare a second compatible deployment
   so both active and retained rollback images understand saved offers.
5. Configure the dedicated payout encryption key without printing it; retain it
   for existing ciphertext. Preserve the separate referral-signing secret.
6. Enable the programme capability only after compatible rollback/readiness
   checks. Publish app/site assets and `/r/<code>` routing from pinned sources.
   No sample or local-review programme is seeded into production.
7. Verify CI/releases, public routes/build identities, migration readiness and
   deployment health. Record provider/customer checks separately from source and
   HTTP evidence. Real campaign configuration remains an operator decision.

## Evidence

Release qualification and final immutable workflow/artifact references are added
as each gate completes. Historical local review records retain their original
scope and do not establish production payment or mail acceptance.
