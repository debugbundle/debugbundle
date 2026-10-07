# Interface parity release — 2026-10-07

Status: released and deployed; engineering, artifact and live runtime gates pass. External directory discovery limits are recorded below.

The owner authorized final regression review, production preparation and triggering
the release train on 2026-10-07. This supersedes the earlier local-only boundary for
the fourteen findings in `interface-parity-remediation.md`. The approved scope covers
the affected package releases, developer distribution pins, public docs, canonical
core release and exact-source hosted rollout. Existing dashboard design patterns
remain mandatory; browser/screenshot investigation is not part of this release.

## Version and dependency plan

| Surface                               | Version | Reason                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------------ |
| Core                                  | 1.15.0  | Additive public capabilities and dashboard parity                        |
| CLI                                   | 1.14.0  | GitHub disconnect, full webhook test-event selection and explicit clears |
| MCP / OpenClaw                        | 1.14.0  | Three additive tools; frozen legacy descriptors retained                 |
| Shared types / redaction release pair | 2.3.0   | Additive exported analytics query contract; paired publication workflow  |
| Site                                  | 1.6.2   | Updated public documentation and generated reference                     |
| Codex developer plugin                | 1.2.0   | Adopt the published MCP 1.14.0 capability set                            |
| Claude Code plugin                    | 1.14.0  | Adopt the published MCP 1.14.0 capability set                            |
| Gemini extension                      | 1.1.0   | Adopt the published MCP 1.14.0 capability set                            |

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

- Fresh release qualification: 4,066 unit tests in 497 files; all 73 changed
  source coverage gates pass. Frozen legacy MCP fixtures are unchanged.
- Fresh release integration: 141 tests in 31 files pass, including the published
  Browser SDK 3.1.0 HTTP/API/database composition path; no skipped cases.
- Fresh dependency audit passes the high-severity gate: no high/critical findings;
  28 moderate and five low advisories remain.
- Remote core, site and cloud `main` match their local baselines. All pending core
  and site changes belong to the authorized parity work; cloud and Gemini companions
  are clean before preparation.

The immutable source/workflow evidence below distinguishes publication, deployment
and independent live readback. A workflow trigger alone is not a successful release.

## Package publication and final consumer preparation

- Shared types/redaction 2.3.0 published and clean registry consumers passed:
  [workflow 37655850138](https://github.com/debugbundle/debugbundle/actions/runs/37655850138), source `5de8338470a6b3cf650bdb191a16c8a6bd4d88d2`.
- CLI 1.14.0 published; installed Node 22/24/26 lanes and registry smoke passed:
  [workflow 37656792471](https://github.com/debugbundle/debugbundle/actions/runs/37656792471).
- MCP 1.14.0 published; candidate/native Codex matrix, OpenClaw build and registry
  stdio/native checks passed:
  [workflow 37656797000](https://github.com/debugbundle/debugbundle/actions/runs/37656797000).
  CLI/MCP publication source: `edd52cf4f63ce0c96f70702fb11326bc6dfd627f`.
- Hosted shared-package pins adopt exactly 2.3.0 after registry verification. The
  normalized lockfile changes only those two versions and their integrity hashes.
- Codex 0.153.1, Claude Code 2.1.277 and Gemini CLI 0.61.0 native candidate checks pass
  with 130 tools, local evidence, authentication boundaries and removal. Contract
  checks pass (81 Gemini/routing/setup cases and 16 Codex/Claude/routing cases).
- Full lint/typecheck/license checks, candidate/OpenClaw builds and all 73 changed
  source coverage gates pass. The site audit reports no known vulnerabilities.
- Cloud migration, activation, retention and site-boundary tests pass (35 cases).
  No cloud deployment code or database schema change is required.

## Final CI fixture correction

Exact-source CI `37660164081` caught a Gemini publication fixture that still created
`v1.0.1` after the package moved to 1.1.0. The production verifier correctly rejected
it; the live public repository/tag and native install had already passed. The fixture
now derives its expected tag from the copied package manifest and retains missing-tag
rejection, with an additional wrong-version assertion. The focused Gemini check now
includes this publication test and installs its Git prerequisite, so version bumps
exercise the complete package/publication contract before promotion. This changes no
shipped application/package behavior or production verification requirement.

## Published sources and workflows

- Core runtime source: `9b993a08ed7634716e212772e51a34d0bb9c8327`,
  [core 1.15.0](https://github.com/debugbundle/debugbundle/releases/tag/v1.15.0).
  [CI](https://github.com/debugbundle/debugbundle/actions/runs/37663189497),
  [installed CLI compatibility](https://github.com/debugbundle/debugbundle/actions/runs/37663189553)
  and [core release](https://github.com/debugbundle/debugbundle/actions/runs/37666033806)
  passed. Public CI passes 4,052 tests in 91 shards, with 14 private-site cases skipped;
  all 14 pass locally. Merged coverage is 86.65% lines, 89.09% functions, 76.92%
  branches and 85.81% statements. All 73 changed-source gates passed against the audit
  baseline locally; the final fixture-only CI diff contains no changed source files.
- Site source: `3e8336c31abd04aadfacd48e8da4e6405a7147cd`,
  [site 1.6.2](https://github.com/debugbundle/site/releases/tag/v1.6.2).
  [Site CI](https://github.com/debugbundle/site/actions/runs/37660516450) and
  [release](https://github.com/debugbundle/site/actions/runs/37660942403) passed.
  This includes the owner's Managing Noise edits: the resource-provider examples and
  removal of the obsolete upgrade paragraph, alongside the parity documentation.
- Additional final local regression passes 1,522 infrastructure/contract/package tests
  in 162 files. The expanded Gemini release check passes all 82 cases in eight files.
- Hosted workflow source: trusted cloud `main` at
  `3dad3e356bec26834bd1528db66070daf5e1c1e5`.
  [Hosted rollout](https://github.com/debugbundle/debugbundle-cloud/actions/runs/37666936585)
  is pinned to the core/site SHAs above, with `mcp_caddy_gate=preserve` and the normal
  previous-stable retention policy. Its outcome and independent readback follow below.

## Ecosystem and developer distributions

All five MCP uploads were accepted from the published 1.14.0 artifact. Official
Registry 1.14.0, indexed Smithery MCP and skill, ClawHub skill 1.14.0, and OpenClaw
latest 1.14.0 are verified. The Registry's expired short-lived login was renewed with
the existing DebugBundle DNS signing key; no signing material was printed or changed.

The ClawHub skill's final verdict is clean. OpenClaw's preliminary broad-capability
flag settled to clean after the asynchronous review completed: VirusTotal clean,
review verdict benign, no moderation reasons and downloads enabled. All published
file hashes match reviewed source/builds. The independently downloaded OpenClaw
archive and all six files match; its SHA-256 is
`ecfe50f93a94d0ba345fabc97d045a7fac35b0c21fd1886bef74a94fee942a70`.
The downloaded ClawHub skill content also matches the reviewed source.

Strict ecosystem discovery remains partial: five of seven ClawHub capability queries
pass; the combined query is absent and incident-response rank is 17 against the
required top ten. Glama's API returns 401. Its public listing is discoverable at
[Glama](https://glama.ai/mcp/servers/debugbundle/debugbundle), but the cached page is
not evidence of this release's fresh catalog. PulseMCP and LobeHub could not be
verified through their public pages; MCP.so was found. No discovery gate was weakened.

Codex 1.2.0, Claude Code 1.14.0 and Gemini 1.1.0 are published and native public-install
checks pass with 130 tools. Gemini's downloaded release ZIP matches the reviewed
package. See the [distribution ledger](agent-distribution-ledger.md) for exact public
sources, clients and digest. Hosted OpenAI 1.0.1 and its frozen 23-tool catalog remain
independent; this train performs no portal submission or plugin publication.

## Hosted readback

The source-pinned hosted workflow passed. Before rollout, the API and worker
were healthy with zero restarts and 45 GiB free. Agent-token issuance remained unset
(default disabled); hosted OAuth and MCP flags were true. The newly published CLI
1.14.0 successfully read the existing production API before its upgrade. Its scoped
incident data matched the baseline (one unrelated OAuth incident, unchanged count
three and last occurrence on October 6), and the endpoint check was passing with zero
consecutive failures. The installed host CLI reports 1.10.0.

Independent post-deploy checks pass:

- API and worker both run root version 1.15.0, revision
  `9b993a08ed7634716e212772e51a34d0bb9c8327`, immutable image digest
  `sha256:b352d7980759b77362d4fe112932e9f00d34869afaeb978487028f59c0b58207`.
  Both are healthy with zero restarts and no OOM kills. Worker readiness confirms
  `processing_enabled=true` and `worker_job_protocol=postgres-v1`.
- Ordered migration execution reports `applied=0; already_applied=57`. No schema
  change was required. Runtime promotion preceded dashboard/site asset publication.
- Public API and MCP readiness return 200. App `version.json` matches the exact core
  SHA, site reference data reports 1.15.0, OAuth discovery retains the expected
  issuer, and unauthenticated MCP returns the expected 401 resource-metadata challenge.
- The live Managing Noise page returns 200 and contains the owner's edits and parity
  controls documentation. The obsolete upgrade paragraph is absent.
- Installed CLI 1.10.0 and clean registry CLI 1.14.0 both return identical scoped
  incident state to the baseline. The health check remains passing with zero
  consecutive failures and HTTP 200 after promotion; local active incidents are empty.
- Agent issuance remains default-disabled, and hosted OAuth/MCP flags remain enabled,
  exactly matching the pre-deploy whitelist. No role/tier/feature gate was changed.
- Retention dry-run verifies active `20261007183207-3acae674a892` plus previous stable
  `20261007002031-ddea68520ef9`, retaining both releases' immutable API/worker images.
  There are zero release-directory/image deletion candidates and 45 GiB free.

No browser, physical-device, live provider mutation, or customer notification test was
performed for this candidate. Automated source/DOM/integration and live service/read
checks are the verified scope. The unrelated pre-existing OAuth incident remains open.
Documentation and OpenAI source/image provenance follow-ups do not change the deployed
core or site SHA, and do not submit or publish the OpenAI plugin.
