# Public status release — 2026-10-10

Status: authorized release preparation in progress.

The owner approved the final UI and explicitly authorized production readiness,
commits, pushes, package publication and the hosted release train on 2026-10-10.
Scope covers FR-AVC-07, the shared daily-tooltip correction, safe installed-schema
startup, mock parity, public documentation and hosted configuration. The complete
implementation and earlier qualification are recorded in `public-status-pages.md`.

## Versions and sequence

| Surface                  | Candidate | Reason                                                                   |
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

## Evidence

- Core, site and cloud main match their remote baselines before preparation.
- Registry readback confirms shared 2.3.0 and CLI/MCP 1.14.0 are current; planned
  versions are unpublished. All existing pending edits belong to the reviewed
  public-status implementation and its local refinements.
- Earlier full qualification and current frontend regressions are recorded in the
  implementation spec. Fresh release gates and immutable publication/deployment
  identities will be recorded here as they complete.

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

Developer candidates Codex 1.3.0, Claude Code 1.15.0 and Gemini 1.2.0 now pin the
verified MCP 1.15.0. Gemini packaging/routing/setup contracts pass all 82 cases;
Codex/Claude/routing contracts pass all 16 cases. Native Codex 0.153.1, Claude Code
2.1.277 and Gemini CLI 0.61.0 pass isolated installation, 134-tool discovery, local
evidence/authentication boundaries, update/reinstall and removal as applicable.
Public marketplace/source verification follows promotion to public main.
