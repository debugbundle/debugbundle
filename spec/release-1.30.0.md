# Core 1.30.0 and site 1.11.2 release

The owner authorizes the complete DebugBundle release train for the audited
programme, table, People-avatar and homepage changes. This includes release
branches, commits, CI, package/marketplace publication, tags and hosted rollout.
Consumer products remain outside scope. Preserve all commercial data, settings,
credentials and feature switches. No campaign activation, payment or mail canary
is part of this release.

## Distribution decisions

| Distribution                     | Decision | Version  | Reason                                                                                                        |
| -------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| Core runtime                     | Publish  | 1.30.0   | Atomic custom-code draft creation and optional avatar API capabilities                                        |
| CLI / ordinary MCP               | Publish  | 1.28.0   | New optional code, inventory and avatar inputs in installed commands/tools                                    |
| OpenClaw companion               | Publish  | 1.28.0   | Includes the changed ordinary MCP implementation                                                              |
| Portable ClawHub skill           | Publish  | 1.28.0   | Exact CLI/MCP installer pins change                                                                           |
| Shared types                     | Publish  | 3.8.0    | Optional organisation-person avatar schema is a shipped public addition                                       |
| Redaction                        | Retain   | 2.7.1    | No changed installed behavior; require immutable archive equality                                             |
| Public site                      | Publish  | 1.11.2   | Skip-link, homepage animation/navigation and testimonial asset corrections                                    |
| All 13 capture SDKs/adapters     | Retain   | Existing | No capture, event, redaction or transport change; organisation management schema is outside capture contracts |
| Codex / Claude / Gemini packages | Retain   | Existing | Existing published MCP pins remain compatible                                                                 |
| Restricted hosted OpenAI plugin  | Retain   | Existing | No changed restricted tool contract or submission                                                             |

## Qualification and rollout

The source audit and final spacing refinement are recorded in
[the local audit](release-audit-20261119.md). Fresh release CI must pass on the
reviewed branches. Publish shared-types before changing hosted dependency pins;
retain the existing redaction bytes. Qualify installed CLI/MCP/OpenClaw artifacts.
Keep unpublished installer pins on the release branch until registry acceptance.

Capture a read-only production baseline. Deploy the exact compatible API/worker
candidate with assets disabled before advertising new client inputs. No new
migration is introduced; normal ordered migration/readiness checks still apply.
Then publish CLI/MCP and run the mandatory local ecosystem pipeline against the
exact npm artifact, selecting official Registry and ClawHub; Smithery remains
retired. Exact-version security, native installation and five-of-seven discovery
remain separate gates.

Merge qualified source branches, publish canonical tags/releases, and deploy the
exact core/site commits through the private cloud repository. Verify API/worker
versions and digests, readiness, worker activation, retained rollback images,
unchanged data/configuration, API boundaries, public context, app/site markers,
asset bytes and manifest MIME/cache behavior. Restore matching dashboard assets
if rolling back to an older API that rejects the new optional inputs.

## Receipts

In progress. Private operator evidence is retained under `.tmp/release-1.30.0/`;
the hosted repository records production receipts separately.

The initial shared-types publication was accepted with matching metadata, but
fresh clients received tarball 404 responses. The old registry smoke reused its
packed-candidate npm cache and therefore passed without proving download
availability. Three failing regression cases reproduce that cache-boundary gap.
The selected shared/CLI/MCP workflows now use an empty post-publication cache.
No immutable version is republished; production remains held until genuine
registry downloads and the final source CI pass.
