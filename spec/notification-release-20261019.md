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
