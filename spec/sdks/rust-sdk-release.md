# Rust SDK first publication and release automation

## Stable 1.0.0 - published 14 November 2026

Stable source `a522d78385f3a4ae332dab330399625b15e26fa9` and tag `v1.0.0`
pass all eight [qualification jobs](https://github.com/debugbundle/debugbundle-rust/actions/runs/43576997485).
[Trusted publication](https://github.com/debugbundle/debugbundle-rust/actions/runs/43581543389)
passes exact public metadata/index/download checks and genuine registry-installed
standalone, Axum and Actix applications. The immutable crate SHA-256 is
`d5f346aeedaa8d71b6aa74a24ac2a875baabdb93c6a4349a62a3056a00d08524`.
[crates.io](https://crates.io/crates/debugbundle/1.0.0) and the independent
[GitHub release](https://github.com/debugbundle/debugbundle-rust/releases/tag/v1.0.0)
are public. SDK runtime code is unchanged from the audited alpha. Rust is now
recorded in the core release train; the core gate verifies the selected public
archive without republishing it. Core/site deployment remains a separate gate.

## Historical alpha qualification and implementation

Published alpha: `1.0.0-alpha.1`, 14 November 2026 local time (13 November UTC).
The [crate](https://crates.io/crates/debugbundle/1.0.0-alpha.1) and
[GitHub prerelease](https://github.com/debugbundle/debugbundle-rust/releases/tag/v1.0.0-alpha.1)
contain the reviewed archive, not a new SDK implementation.

The immutable alpha archive still contains its pre-publication README wording.
Current repository and public-page source use the published installation command;
the next version will include that updated packaged README. Do not replace or
retag the accepted alpha to alter documentation.

| Identity | Accepted value |
| --- | --- |
| SDK source/tag | `eb9e09afc02751ebd34464bfa4b8808a565635b4` / `v1.0.0-alpha.1` |
| Crate SHA-256 | `1aed6405f1b6b80ef9430d8300e9efe330a9e06be8c51587da0a41fe07abd8bc` |
| Size | 224714 bytes |
| Eight-job source/native/artifact qualification | [43468613263](https://github.com/debugbundle/debugbundle-rust/actions/runs/43468613263) |
| Upload and genuine registry consumer checks | [43530643791](https://github.com/debugbundle/debugbundle-rust/actions/runs/43530643791) |
| Verification-only recovery | [43531207396](https://github.com/debugbundle/debugbundle-rust/actions/runs/43531207396) |
| Release tooling repairs | `1112653`, `6d33321`, `2d98d9b` |

The public index, downloaded crate and GitHub asset agree on that checksum.
Actual registry-installed standalone, Axum and genuinely non-Send Actix
applications pass with newly resolved/frozen consumer locks. An upload alone was
not accepted as installability proof. No installed consumer application changed.

## Failure analysis and recovery

The original manual release `43509801242` passed all eight qualification jobs,
then failed before credentials/upload because container Git rejected the hosted
checkout's ownership. Missing receipts produced a secondary upload error.
Command-scoped `safe.directory` trusts only the intentional checkout.

Recovery `43523048299` exposed Cargo 1.99's publish layout: `package/tmp-crate`,
rather than the `cargo package` path. A stale local archive had hidden that defect.
Every publish/dry-run now receives a fresh target directory. A regression checks
that stale matching bytes cannot hide different fresh bytes.

Recovery `43530294276` passed exact-byte preflight but failed before upload:
crates.io's default Cargo credential is `CARGO_REGISTRY_TOKEN`. Both bootstrap and
OIDC credentials now use that variable, forwarded only into the publishing
container. Public temporary package directories are readable by the hosted
artifact uploader; restrictive root-created directories no longer mask failures.

Run `43530643791` published once and passed all registry/consumer checks, then
received HTTP 403 while creating the GitHub release with its integration token.
The authenticated owner CLI completed the exact-source prerelease and asset.
The next recovery resolves the existing matching version to verification only,
with credentials and uploads skipped. Historical failures remain in the record.

## Normal release path

A deliberate `v*` tag starts `Crate release`; normal main pushes qualify source
without publication. Recovery takes an optional source ref, with no owner-entered
version, digest or authentication selector. The planner selects the latest trusted
qualification for the exact source, requires all eight jobs, validates the
immutable artifact and derives release inputs. Active qualification is awaited,
not duplicated. Source and tooling checkouts remain separate so tooling repairs
can recover an already-qualified SDK without changing the reviewed archive.

The `crates-io` environment allows main and version tags with no recurring owner
approval prompt. Existing matching, non-yanked versions select verification only;
checksum mismatches fail closed. Uploads are never blindly retried. New SDK bytes
still require a version bump and complete qualification.

The owner registered the one-time Trusted Publisher identity
`debugbundle/debugbundle-rust`, workflow `release.yml`, environment `crates-io`.
Credential-only [check `43575500128`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43575500128)
passes the actual crates.io OIDC exchange and the official action's temporary-token
cleanup. Qualification and publication jobs were both skipped. The obsolete
`CRATES_IO_BOOTSTRAP_TOKEN` environment secret was then removed; the GitHub
environment secret inventory is empty. Revocation of the original token in the
owner's crates.io account is separate and not evidenced by GitHub secret removal.
The bootstrap secret is never a fallback for future releases.

Earlier credential-only [check `43532449126`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43532449126)
obtained GitHub's OIDC token but received HTTP 400 because the registry mapping
had not yet been saved. That historical failure is superseded by the passing
post-registration check above.

Tooling commit `42dfc32` adds `verify_publisher_only` to the same `release.yml`.
It checks the real OIDC exchange and official action cleanup without qualifying
source, reading the bootstrap secret or publishing a package. This permits the
initial registry identity to be checked independently of a new version.
Both identity checks skipped qualification and publication and uploaded no crate.

Stable `1.0.0` is planned for the coordinated main-repository and public-site
release. Prepare the stable version and packaged README, qualify that exact new
archive, deploy the relevant main-repository changes, publish Rust through its own
`v1.0.0` tag, then ship matching stable installation/docs references on the site.
Main pushes alone do not publish Rust. This plan is not publication/deployment
authorisation; the stable release remains pending the coordinated release decision.

Local release verification includes 21 release-tool tests, pinned actionlint,
the Linux foreign-owner reproduction and fresh actual Cargo dry runs. Receipts
are under `.tmp/rust-release-recovery/` and the SDK's `.tmp/`. Core/spec/site edits
remain local; public pages now describe the published alpha and preserve Rust's
position after PHP. No core/site deployment or other SDK/consumer mutation occurs
in this release. The separate owner-hook budget follow-up remains open.

## Final local review

Release-only applicability was checked against Go/Python/.NET tag workflows;
provider-specific Git ownership, Cargo output and credential wiring do not change
any SDK wire/runtime contract. No other distribution was changed. Source identity,
failed/missing qualification, archive substitution, existing-version checksum and
existing-tag safety remain covered. Credentials reach publishing only; recovery
of a matching public version skips them. The accepted final recovery also proves
receipt upload works under the hosted non-root uploader.

All three Rust public-doc tests pass after failing on stale unpublished guidance.
All 98 site tests, root typecheck, focused lint/format, public static export and
site typecheck pass. Generated machine-readable artifacts are refreshed. The
remounted preview at `http://localhost:5292` serves the exact alpha dependency on
the homepage, installation and Rust guide, with the current `/llms.txt` entry.
These are source/static-export/local HTTP checks, not a production deployment or
browser visual acceptance. No database/schema or consumer adoption path changed.
