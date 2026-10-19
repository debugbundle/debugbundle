# Notification preferences release — 2026-10-19

Status: core 1.18.0 and site 1.6.7 are published and deployed. The owner authorized
the release after local review. Production migration, readiness, API/CLI reads,
served build identity and rollback retention pass. The MCP ecosystem remains
qualified by the external publication/discovery limits recorded below.

Scope: FR-ALT-08 / FR-EMAIL-08 and the approved settings, submit-feedback and email-preview
refinements. Detailed implementation and local evidence are in
[notification preferences](notification-preferences.md).

## Versions and order

| Surface | Published |
| --- | --- |
| Core | 1.18.0 |
| Shared types / redaction | 2.6.0 |
| CLI / MCP / OpenClaw / portable skill | 1.17.0 |
| Website | 1.6.7 |
| Codex / Claude Code / Gemini | 1.4.0 / 1.17.0 / 1.3.0 |

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
Public Codex/Claude installs from core `a4e0ffca` pass; Gemini public Git install,
update/removal, tag/source parity and downloaded ZIP integrity pass against
`51b1c33643d47e4db742778796bb42f50830d742`.

## Final qualification and production

[Final candidate CI 39246712952](https://github.com/debugbundle/debugbundle/actions/runs/39246712952)
passes lint, typecheck, 4,332 tests in 96 shards (14 conditional skips), build and
native Gemini on Node 22/24/26. The unchanged coverage gate passes all 67 changed
source files, including 15 assessed by changed-line coverage. CLI runtime
compatibility workflow 39246712950 also passes. An earlier CI attempt caught stale
OpenAI source provenance; the manifest-only correction and all 13 provenance tests
pass without changing the independently versioned plugin archive or frozen catalog.

[PR 9](https://github.com/debugbundle/debugbundle/pull/9) is merged at
`a4e0ffcab75346818bbab06b0386cb9bffc48a56`. The canonical
[core 1.18.0 release](https://github.com/debugbundle/debugbundle/releases/tag/v1.18.0)
and [site 1.6.7 release](https://github.com/debugbundle/site/releases/tag/v1.6.7)
pass workflows 39249346003 and 39249872065. Site CI 39245956246 passes after core
contract promotion; the earlier expected 134-versus-138-tool mismatch is resolved.

[Hosted deployment 39249938711](https://github.com/debugbundle/debugbundle-cloud/actions/runs/39249938711)
succeeds from trusted cloud source `b2508b1671c16a0d0ade55e682c082c48cbb827a`,
core source `a4e0ffcab75346818bbab06b0386cb9bffc48a56` and site source
`cb9679ac1a68b4067c19740d82acaff30e0f6aaf`, preserving the existing MCP gate.

- API and worker independently report core 1.18.0, image digest
  `sha256:dfd67096ee1a5140d967be9e142709cb99781615cdbd7a3d465768a3f10043df`,
  healthy containers, zero restarts/OOMs, and worker processing enabled.
- Read-only database verification confirms 59 migrations, latest
  `202610180001_add_notification_preferences`, and all four notification tables.
  All 11,882 observed worker jobs are completed. Migration runs before activation.
- Authenticated account/project personal/shared preference GETs return HTTP 200
  with no-store; the published CLI 1.17.0 reads all four scopes successfully.
  Existing effective delivery defaults remain immediate; no customer settings changed.
- Public API/MCP readiness is healthy throughout the sampled rollout window.
  The live dashboard `version.json` identifies the exact deployed core SHA.
  Public OpenAPI includes both notification preference scopes. CDN invalidations
  and the workflow's external endpoint/site checks pass.
- The connected production project's bounded incident read has no new incidents
  or changed last-seen times; its four pre-existing active incidents remain.
  Its endpoint health check is passing with zero consecutive failures.
- Active runtime `20261019121425-d1c61b93cbff` retains verified previous stable
  `20261017125033-c494777251f4` and both previous images at
  `sha256:7f44f85f40d11085e7d0c58e7fdf0b2ffb305bd989f16854ce574cb951690464`.
  Retention dry run has zero deletion candidates; disk has 45 GiB free.

No browser inspection or live-provider email send was performed. Local integration
coverage verifies delivery policy, scheduling, retries and suppression; production
verification is read-only. SDKs and the independent OpenAI portal publication stay unchanged.

## Registry security, artifact integrity and external limits

Official MCP Registry 1.17.0 and the Smithery skill update are accepted and independently
found. Both ClawHub 1.17.0 distributions are published: skill receipt
`k97fnx26pk591srv3gcycdk1ks8gknmh`, plugin receipt `rd7cacz6mzfr9y0shjbnry734h8gjrmn`.
The unchanged verifier confirms both exact-version security gates pass: clean
overall outcome, benign final review, clean antivirus, and unblocked skill moderation.
Plugin antivirus reports zero malicious and suspicious detections across 61 engines.
Static heuristics concerning Undici's test flag, the redaction regex and intentional
CLI auth reads remain recorded and are adjudicated benign by the final review;
low-severity skill boilerplate/access-control findings are also retained. No scan
was bypassed or suppressed.

The downloaded plugin archive passes registry integrity checks and all six files
match the reviewed artifact. SHA-256:
`525b10b0ee3ea7b64482df474157db6900d66ea7a0b8774e7e40c81a30bddc11`.
Both downloaded skill files match source and registry hashes; SKILL.md SHA-256:
`e066f8bf3df614386c69492ffb29bfef433b74c1f45c09433f2dc5ea77e5460c`.

The full ecosystem verifier deliberately remains non-green:

- Smithery MCP server publication returns HTTP 403, `Updating servers has been removed`.
  Its existing listing is not proof of a 1.17.0 update; provider intervention remains required.
- ClawHub search satisfies 5/7 configured rank checks: the aggregate query is absent
  and incident response is rank 17 against the top-ten target.
- Glama returns HTTP 401; PulseMCP and LobeHub require manual discovery verification.
  MCP.so is found. These do not alter the verified npm/plugin installation paths.

Detailed scanner/artifact evidence is retained locally in
`spec/local/notification-release-20261019.json`; workflow links above provide durable
qualification/deployment records. Source/doc reconciliation does not change the
exact deployed SHA or require another runtime release.
