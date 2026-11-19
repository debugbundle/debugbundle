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

Core 1.30.0 and site 1.11.2 are published and deployed. Private operator evidence
is retained under `.tmp/release-1.30.0/`; the private cloud runbook
`runbooks/core-1.30.0-site-1.11.2.md` owns exact runtime and asset receipts.

- Qualified core `e29549e3` passes [full CI](https://github.com/debugbundle/debugbundle/actions/runs/44508865738):
  146 shards, 7,258 passing tests, unchanged coverage gates and 18 PDF cases.
  Sixty-nine environment-dependent skips are closed with the actual site checkout,
  Europe/Ljubljana and PDF lanes; the supplemental 73 site-contract and 13
  date/form cases pass. Final coverage is 88.93% lines, 90.78% functions,
  79.84% branches and 87.52% statements. All 33 changed-source checks pass.
- [PR22](https://github.com/debugbundle/debugbundle/pull/22) merges as `cfff75b6`
  with a tree identical to the qualified candidate. The [canonical release](https://github.com/debugbundle/debugbundle/actions/runs/44521056605)
  publishes [v1.30.0](https://github.com/debugbundle/debugbundle/releases/tag/v1.30.0).
- [CLI](https://github.com/debugbundle/debugbundle/actions/runs/44517867679) and
  [MCP](https://github.com/debugbundle/debugbundle/actions/runs/44517877892)
  publish 1.28.0 with packed/native and fresh-cache registry acceptance. Downloaded
  archives match full SHA-512 integrity, qualified `gitHead` and the new installed
  code/avatar capabilities. Shared-types 3.8.0 and retained redaction 2.7.1 pass
  [fresh-cache acceptance](https://github.com/debugbundle/debugbundle/actions/runs/44508856442)
  and independent exact-archive/schema checks.
- Site `98ff723` passes [CI](https://github.com/debugbundle/site/actions/runs/44511245546)
  and merges through [PR9](https://github.com/debugbundle/site/pull/9) as `d378b77`
  with an identical tree. [Main CI](https://github.com/debugbundle/site/actions/runs/44520828058)
  and [v1.11.2 release](https://github.com/debugbundle/site/actions/runs/44521069566)
  pass. The local export's 64 Chromium/WebKit keyboard cases cover both banner
  states, themes, widths and enlarged text; this is separate from production byte acceptance.
- Official Registry, ClawHub skill and companion resolve 1.28.0. Both final
  ClawScan reviews and skill moderation are clean; three skill heuristic warnings
  remain recorded and adjudicated benign. Six of seven capability queries rank
  in the top ten, exceeding the required five. Normal public exact-version
  installation on current OpenClaw 2026.11.5 passes without force; the published
  portable skill body and installer pins match source. Optional Glama discovery
  API authorization and LobeHub manual indexing remain separate from these
  mandatory gates. Smithery remains retired.
- [Backend stage](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44516635536)
  precedes new client publication. [Final full rollout](https://github.com/debugbundle/debugbundle-cloud/actions/runs/44522456731)
  deploys exact core `cfff75b6` and site `d378b77` from trusted cloud `2285113`.
  API/worker 1.30.0, readiness, active processing, two retained releases and all
  four immutable role references pass independently. All 95 migration rows and
  checksums, recorded configuration/credentials and 16 commercial/financial table
  fingerprints remain unchanged. Deleted programmes stay absent and no aliases
  are added. No new active incident IDs appear in the scoped DebugBundle project; only the pre-existing reviewer
  warning gains two expected startup occurrences.
- Public readback passes 26 HTTP/build/routing/auth checks, exact current asset
  bytes against S3 and all 23 previous asset references. The 23 current JS/CSS/font
  references retain their MIME and immutable caching. Manifest delivery has
  `application/manifest+json`, `max-age=300`, `s-maxage=3600` and a subsequent
  CloudFront hit. Delivered skip-link rules, homepage markup, WebP files and final
  dashboard spacing/capability bytes match source. No production visual or real
  payment/mail acceptance is inferred.

The later documentation-only reconciliation does not change runtime source or
justify new package versions. Its final-main checks remain separate from the
qualified/deployed commit and are recorded in the private cloud receipts.

The initial shared-types publication was accepted with matching metadata, but
fresh clients received tarball 404 responses. The old registry smoke reused its
packed-candidate npm cache and therefore passed without proving download
availability. Three failing regression cases reproduce that cache-boundary gap.
The selected shared/CLI/MCP workflows now use an empty post-publication cache.
No immutable version was republished. Production was held until genuine registry
downloads and the corrected final source CI passed.
