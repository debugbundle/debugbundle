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
