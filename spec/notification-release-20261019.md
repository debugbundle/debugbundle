# Notification preferences release — 2026-10-19

Status: release preparation. The owner authorized commit, publication and production
deployment after the final local review. No production completion is claimed yet.

Scope: FR-ALT-08 / FR-EMAIL-08 and the approved settings, submit-feedback and email-preview
refinements. Detailed implementation and local evidence are in
[notification preferences](notification-preferences.md).

## Versions and order

| Surface | Candidate |
| --- | --- |
| Core | 1.18.0 |
| Shared types / redaction | 2.6.0 |
| CLI / MCP / OpenClaw / portable skill | 1.17.0 |
| Website | 1.6.7 |

Publish shared packages first, adopt their verified registry versions, then publish
CLI/MCP and run the mandatory MCP ecosystem pipeline. Developer plugin pins change
only after MCP is published and smoke-tested. Core/site release and production
rollout use exact qualified commits. SDKs and the independent hosted OpenAI plugin
remain unchanged. Apply additive migration `202610180001_add_notification_preferences`
before API/worker activation. Retain the previous stable runtime and its images.

## Baseline

Core `14f03866`, site and cloud matched their remote default branches before release
preparation. npm latest was shared 2.5.0 and CLI/MCP 1.16.1; proposed versions were
absent. The connected production project had four pre-existing active incidents,
with no local active incidents. Customer preferences and monitoring remain unchanged.

## Qualification

The final local review passed 4,323 unit regressions plus 26 focused storage checks,
the unchanged 67-file changed-code coverage gate, 174 integration tests (one conditional
SDK fixture skipped), lint, typecheck, candidate builds, native OpenClaw validation
and 41 site tests/build/typecheck. Release-specific CI, published artifact checks,
marketplace acceptance and production evidence will be recorded below.

## Publication evidence

Shared types/redaction 2.6.0 published from `17ab514a` through
[workflow 39244204107](https://github.com/debugbundle/debugbundle/actions/runs/39244204107),
including staged-artifact and registry-installed smoke checks. Independent tarball
verification confirms package identities, SHA-512 integrity, README/LICENSE and the
new shared notification modules. SHA-256: shared types
`e8337e29db5d6da61852f676c3bfdd2258641bf909dc284d5c12867d87c8f169`;
redaction `050f18182e5238c0779257f92eab7186437aa9ab518b1a446b670ca9a0836f46`.

The verified production baseline is core 1.17.0, API/worker digest
`sha256:7f44f85f40d11085e7d0c58e7fdf0b2ffb305bd989f16854ce574cb951690464`,
healthy with zero restarts/OOMs and worker processing enabled. The active release
is `20261017125033-c494777251f4`; free disk is 45 GiB. The existing endpoint check
is passing with zero consecutive failures.

CLI/MCP 1.17.0 published from `20bafbe8` with successful registry-install and
native-client checks in workflows
[39244696765](https://github.com/debugbundle/debugbundle/actions/runs/39244696765)
and [39244702838](https://github.com/debugbundle/debugbundle/actions/runs/39244702838).
Independent npm integrity and archive checks pass. SHA-256: CLI
`e297f960d20ac5d5365fc7594ab088a767555c99813475fe20967c77ff408f9b`;
MCP `0aa9084a0b2863a5c17c9b5de2a96b9b2564525a4fb30878ca0764e1429e9eae`.

Developer candidates adopt that verified MCP: Codex 1.4.0, Claude Code 1.17.0,
Gemini 1.3.0. Contract checks and native Codex/Claude/Gemini checks pass with
138-tool discovery, local evidence, authentication boundaries, update/reinstall
and removal. Gemini deterministic archive SHA-256:
`c629a96cf4a928408d47a391672f432f43ae3c31c9a416c02dd62de92c38f635`.
Public installation verification remains pending until source promotion.
