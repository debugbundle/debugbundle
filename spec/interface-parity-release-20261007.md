# Interface parity release — 2026-10-07

Status: production-readiness review and release preparation in progress.

The owner authorized final regression review, production preparation and triggering
the release train on 2026-10-07. This supersedes the earlier local-only boundary for
the fourteen findings in `interface-parity-remediation.md`. The approved scope covers
the affected package releases, developer distribution pins, public docs, canonical
core release and exact-source hosted rollout. Existing dashboard design patterns
remain mandatory; browser/screenshot investigation is not part of this release.

## Version and dependency plan

| Surface                               | Candidate | Reason                                                                   |
| ------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Core                                  | 1.15.0    | Additive public capabilities and dashboard parity                        |
| CLI                                   | 1.14.0    | GitHub disconnect, full webhook test-event selection and explicit clears |
| MCP / OpenClaw                        | 1.14.0    | Three additive tools; frozen legacy descriptors retained                 |
| Shared types / redaction release pair | 2.3.0     | Additive exported analytics query contract; paired publication workflow  |
| Site                                  | 1.6.2     | Updated public documentation and generated reference                     |
| Codex developer plugin                | 1.2.0     | Adopt the published MCP 1.14.0 capability set                            |
| Claude Code plugin                    | 1.14.0    | Adopt the published MCP 1.14.0 capability set                            |
| Gemini extension                      | 1.1.0     | Adopt the published MCP 1.14.0 capability set                            |

SDK source and package versions remain 3.1.0. Hosted OpenAI and restricted-agent
catalogs retain their independent versions and authority. No database schema change
is required. Never update consumer pins to unpublished packages on public `main`.

## Release sequence

1. Re-audit actual requests, schema/legacy compatibility, authority, stale/partial
   states, secrets and existing design patterns. Fix any reproducible defect first.
2. Qualify package manifests, full unit/coverage, integration including the published
   Browser SDK, dependency audit, native installed clients, public artifacts and
   hosted migration/activation/retention safeguards.
3. Commit and push reviewed release preparation; publish the shared package pair
   through its existing OIDC workflow. Verify registry artifacts before updating
   hosted consumer pins.
4. Publish CLI and MCP through their existing workflows. Complete the mandatory MCP
   Registry, Smithery, ClawHub and OpenClaw follow-through from the published artifact.
5. Update independently versioned developer plugin pins only after the MCP registry
   artifact passes; verify native installation/update/removal and publish the exact
   Gemini standalone package. Refresh the distribution ledger and public guides.
6. Qualify and publish the canonical core and site sources. Deploy reviewed immutable
   core/site SHAs through trusted cloud `main`, with runtime before web assets,
   preserved feature gates and exactly one previous stable release retained.
7. Verify public readiness/build identity, runtime image/version/activation and scoped
   incident/health baseline. Reconcile release evidence and OpenAI source/image
   provenance without submitting or publishing an OpenAI plugin.

## Readiness evidence

- Previous final local qualification: 4,066 unit tests in 497 files; all 73 changed
  source coverage gates pass. Frozen legacy MCP fixtures are unchanged.
- Fresh release integration: 141 tests in 31 files pass, including the published
  Browser SDK 3.1.0 HTTP/API/database composition path; no skipped cases.
- Fresh dependency audit passes the high-severity gate: no high/critical findings;
  28 moderate and five low advisories remain.
- Remote core, site and cloud `main` match their local baselines. All pending core
  and site changes belong to the authorized parity work; cloud and Gemini companions
  are clean before preparation.

Final source SHAs, workflow outcomes, registry/install evidence and hosted results
will be recorded after execution. A workflow trigger alone is not a successful release.
