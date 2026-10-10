# Public status release — 2026-10-10

Status: released and independently verified in production on 2026-10-10.

The owner approved the final UI and explicitly authorized production readiness,
commits, pushes, package publication and the hosted release train on 2026-10-10.
Scope covers FR-AVC-07, the shared daily-tooltip correction, safe installed-schema
startup, mock parity, public documentation and hosted configuration. The complete
implementation and earlier qualification are recorded in `public-status-pages.md`.

## Versions and sequence

| Surface                  | Version   | Reason                                                                   |
| ------------------------ | --------- | ------------------------------------------------------------------------ |
| Core                     | 1.16.0    | Additive public status capability and forward migration                  |
| Shared types / redaction | 2.4.0     | Public status schemas and shared health helpers; paired release workflow |
| CLI / MCP / OpenClaw     | 1.15.0    | Public status management commands and four additive tools                |
| Website                  | 1.6.3     | Owner, automation and deployment documentation                           |
| Codex plugin             | 1.3.0     | Adopt published MCP public status tools                                  |
| Claude Code plugin       | 1.15.0    | Adopt published MCP public status tools                                  |
| Gemini extension         | 1.2.0     | Adopt published MCP public status tools                                  |

1. Qualify the source, security boundaries, additive migration, installed-schema
   upgrade, backwards compatibility, coverage, artifacts and hosted safeguards.
2. Commit/push reviewed preparation on a release branch and publish shared packages first. Verify exact
   npm artifacts before updating hosted consumer pins.
3. Publish CLI/MCP, verify installed artifacts and complete the MCP ecosystem
   follow-through. Review portable-skill changes before selecting publish targets.
4. Update developer package pins only after MCP publication, qualify native clients
   and publish the standalone Gemini source/archive.
5. Publish canonical core/site releases and deploy exact reviewed core/site SHAs
   through trusted cloud main. Apply `202610080001_add_public_status_pages` before
   API/worker activation, then publish dashboard/site assets.
6. Verify runtime SHA/version/digests, migration ledger, readiness, worker activation,
   public and authenticated boundaries, retained rollback artifacts and scoped
   health/incident comparison. Reconcile final docs and source/image provenance.

SDK versions and hosted OpenAI/restricted tool catalogs remain independent. No
OpenAI portal submission or publication is part of this train.

## Preparation baseline

- Core, site and cloud main match their remote baselines before preparation.
- Pre-release registry readback confirmed shared 2.3.0 and CLI/MCP 1.14.0 were current;
  planned versions were unpublished. All existing pending edits belonged to the reviewed
  public-status implementation and its local refinements.
- Earlier full qualification and current frontend regressions are recorded in the
  implementation spec. Fresh release gates and immutable publication/deployment
  identities are recorded below.

## Fresh release qualification

- Full Docker unit run: 4,164 tests in 511 files across 93 coverage shards; all
  pass. All 48 changed-source coverage gates pass, including six existing files
  through changed-line coverage. Merged coverage is 86.89% lines, 89.36% functions,
  77.23% branches and 86.07% statements.
- Isolated Postgres/Redis/S3 integration: all 148 tests in 32 files pass with no
  skips, including the published Browser SDK 3.1.0. A reviewer-fixture timeout
  under concurrent build/lint load passed on the clean rerun without changing
  the test or its timeout.
- All ten self-host startup/application checks pass. The deployed predecessor
  `9b993a08ed7634716e212772e51a34d0bb9c8327` and candidate pass credential and traffic
  compatibility against one forward-migrated disposable database; predecessor
  readiness also passes after removing the candidate. No owner local data is used.
- Full lint/typecheck, candidate builds and OpenClaw validation pass. Core audit
  has zero high/critical findings (28 moderate and five low existing advisories).
  The private site's 41 maintained tests, build/typecheck, generated references
  and audit pass; the site audit reports no known vulnerabilities.
- Cloud deployment, retention and site boundary checks pass (36 cases). Cloud
  configuration is committed/pushed at `1ae2628` before any workflow dispatch.
- Independent production baseline: API/worker 1.15.0 at the predecessor above,
  immutable digest `sha256:b352d7980759b77362d4fe112932e9f00d34869afaeb978487028f59c0b58207`,
  healthy with zero restarts/OOMs; worker processing is enabled. Ledger has 57
  migrations and no public-status tables. API/MCP readiness pass. The scoped
  DebugBundle project has one passing health check and one existing active
  incident last observed on 2026-10-06.

Docker's automatic address pool was exhausted by unrelated local projects.
Verification used unused explicit subnets and distinct disposable names, retaining
all existing networks and data. Self-host checks reused installed dependencies;
the service, bootstrap and migration commands were unchanged.

## Published dependency roots

Shared types and redaction 2.4.0 are published from
`494b783a32bd7abb9f237c7bcd2c5f45cd56c4f9` through
[workflow 38049423839](https://github.com/debugbundle/debugbundle/actions/runs/38049423839).
Candidate and clean registry-consumer checks pass. Independent downloads match
the registry integrity hashes, package identities, Apache licenses and new status
schema exports. Shared-types archive SHA-256 is
`e2949d8e78f86741a7d68332c8de351e89a27be6947eacbd8d7538bd8e3089a8`;
redaction is `3771a153a12e22bcfdc1a06d51aaf8e9c87e9a5d74948718b12987d46e63cf07`.
Hosted consumer pins move to 2.4.0 only after this readback.

## CLI, MCP and native release verification

CLI/MCP 1.15.0 are published from `5d91a0ee5cac156c07c5c866eb3f1b60e66cba8e`.
[CLI workflow 38049752312](https://github.com/debugbundle/debugbundle/actions/runs/38049752312)
and [MCP workflow 38049753938](https://github.com/debugbundle/debugbundle/actions/runs/38049753938)
pass package/runtime matrices and registry-installed checks. Independent downloads
verify exact names, versions, registry integrity, Apache licenses and public-status
commands/tools. CLI archive SHA-256 is
`34dd9ceed1473f304b7466bd30355f3c41eb4e355bb65a5422de26f69b892780`;
MCP is `bfe92f23cf665a31d84f724db262e22179d0a3a9e976586fc91f90aeacd4849c`.

Release review reproduced a native-smoke selection gap: the published Codex test
installed the older marketplace pin (1.14.0 / 130 tools) before developer package
promotion. The published-release target now selects the exact MCP package version
and rewrites only its disposable marketplace. Public GitHub verification retains
the actual published marketplace pin. The corrected smoke passes MCP 1.15.0 / 134
tools, plugin/direct discovery, local evidence, authentication boundaries, reinstall
and removal while the source marketplace still pins 1.14.0. This changes release
verification only; the published MCP artifact and hosted OpenAI contract are unchanged.

Published developer packages Codex 1.3.0, Claude Code 1.15.0 and Gemini 1.2.0 now pin the
verified MCP 1.15.0. Gemini packaging/routing/setup contracts pass all 82 cases;
Codex/Claude/routing contracts pass all 16 cases. Native Codex 0.153.1, Claude Code
2.1.277 and Gemini CLI 0.61.0 pass isolated installation, 134-tool discovery, local
evidence/authentication boundaries, update/reinstall and removal as applicable.
Public marketplace/source installation, updates and removal pass against the promoted main branches; the Gemini release ZIP also matches the validated source byte for byte.

## Published ecosystem and discovery limits

Official MCP Registry `com.debugbundle/mcp` 1.15.0, Smithery MCP and Smithery skill
publication and public lookup pass. OpenClaw 1.15.0 is publicly available as latest,
with a clean aggregate scan, zero VirusTotal malicious/suspicious detections and
clean LLM review. Its downloaded archive exactly matches all six reviewed source
files, SHA-256 `19435befbab9e0636912097a8177a65b172499e5610f9bc505463eb2e8917064`.
ClawHub records the source commit; it does not report cryptographic provenance.

The portable ClawHub skill is unchanged and remains 1.14.0; exact-version, license
and clean moderation checks pass without republishing identical content. Two of
seven bounded search-rank checks pass. MCP.so lookup passes; Glama's public query
returns 401, and PulseMCP/LobeHub require manual visibility verification. These
external discovery limits are retained rather than treating accepted publication
as proof of search ranking or republishing unchanged artifacts.

## Pre-deployment provenance correction

Canonical core 1.16.0 is published from `62b9950be74b39f184a3c0ce54d2f170de709790`
through [release workflow 38050610425](https://github.com/debugbundle/debugbundle/actions/runs/38050610425).
Site 1.6.3 is published from `84fa7bc1247ad605dc22796a8dc8e659ff80ad52` through
[workflow 38050687474](https://github.com/debugbundle/site/actions/runs/38050687474);
site CI 38050658715 passes.

Core CI 38050456704 stopped at the committed OpenAI source-manifest check because
its recorded source commit preceded the release changes. Deployment was held.
The repository-owned preparation/verification targets reproduced the drift and
refreshed only `source.commit`, preserving the plugin version, exact package hashes,
23-tool contract and currently deployed image digest. Follow-up
`f658a487f58807c1eaab2bdcd6cd2dfcb45cd338` contains only that evidence correction;
all 13 committed-source release checks pass. [CI 38051304207](https://github.com/debugbundle/debugbundle/actions/runs/38051304207)
passes all 4,150 public tests in 93 coverage shards, lint, typecheck and build. Its
14 intentional private-site skips passed in the 4,164-test local gate. CLI runtime
compatibility and the Gemini Node 22/24/26 matrix also pass before deployment. The canonical tag remains unchanged, and runtime application
source is identical to it.

## Production deployment and independent readback

[Hosted workflow 38052622593](https://github.com/debugbundle/debugbundle-cloud/actions/runs/38052622593)
uses trusted cloud `1ae26283d0fc38f895885737ed9dd5d3a30356a3`, product
`f658a487f58807c1eaab2bdcd6cd2dfcb45cd338` and site
`84fa7bc1247ad605dc22796a8dc8e659ff80ad52`. Core 1.16.0 API and worker both run
immutable digest `sha256:99961a4d911d79ac053f02642c7207d5acdba253c8e0db5eb36c9bada58103b2`
in release `20261010124130-3097d00cdb0a`. Independent SSH readback matches the
revision, version and digest, with healthy containers, zero restarts/OOM kills,
`postgres-v1` and worker processing enabled.

Automatic database backups are enabled and the preflight restore point is
2026-10-10 12:11:18 UTC. The additive migration applied at 12:42:17.284 UTC;
the ledger has 58 entries, exact checksum
`178d76996c160d95b47aa9c852e1b6f3c57703435e54b174605a28972ccab1da`, and all three
public-status tables. The rollout applies migrations before candidate activation.
API configuration uses `https://app.debugbundle.com/status` and trusted private
proxy handling; existing OAuth/MCP gates remain enabled.

Live read-only verification passes:

- API/MCP readiness, original OAuth issuer and unauthenticated MCP challenge;
- dashboard build ID matching the deployed product commit and `/status/:publicId`
  SPA routing;
- anonymous unavailable-page 404 with the exact generic body and `no-store`;
- unauthenticated settings/options/preview rejection, and authenticated owner
  settings/options returning 200 with `no-store`;
- public documentation and generated core 1.16.0 references including all four
  status tools;
- served JS/CSS and source-matching logo, including status-page, system-theme,
  spaced logo/attribution and shared tooltip markers.

The scope's existing public page remains disabled. No customer status selection
or publication was changed for verification. Positive publication, multi-project
selection, safe aggregates and unpublishing are covered by the real integration
gate; HTTP/asset verification does not claim browser/device interaction testing.

Retention readback proves exactly the active release plus previous stable
`20261007183207-3acae674a892`, retaining both API/worker immutable references and
images for each. The previous digest remains
`sha256:b352d7980759b77362d4fe112932e9f00d34869afaeb978487028f59c0b58207`;
disk has 45 GiB free. The first scoped post-promotion health check passes with zero
consecutive failures. The pre-existing active incident has no new occurrence.

The hosted workflow completed successfully, including migration-before-activation,
SPA/site publication, CloudFront invalidation completion and external endpoint
verification. The OpenAI plugin keeps version 1.0.1 and its frozen 23-tool contract;
only its local source/runtime provenance is refreshed after final evidence commits.
No portal submission, directory publication or reviewer-state change is included.
