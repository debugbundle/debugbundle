# PHP exception-envelope patch — 20 October 2026

The owner authorized DebugBundle publication after local review. This did not
authorize a SayCheese consumer deployment; that action exceeded the release
scope. All future consumer changes require separate product-specific consent.
PHP SDK 2.0.2 is published from
`18a5db013648b53493924b524b14240929f234ee`.

## Behavior and compatibility

Empty throwable messages use the throwable class before hooks and suppression.
Nonempty messages, stack/class/handled evidence, mandatory redaction and existing
hook outcomes retain their contracts. Missing exception request headers/query
serialize as JSON objects. Public signatures, event schema, transport and database
shape are unchanged. No core API/worker deployment or core version bump is needed.

FR-SDK-03/15/16 and AC-SDK-07b cover the SDK behavior; ingestion retains
FR-ING-01/02 and AC-ING-01/02 validation. Existing PHP 1.x/2.x installations remain
on their installed version until explicitly upgraded.

## Publication verification

- [Committed-source CI 39406440529](https://github.com/debugbundle/debugbundle-php/actions/runs/39406440529)
  passed PHP 8.2/8.3/8.4/8.5 tests, PHPStan, clean installed-artifact smoke and
  coverage. Each runtime passed 152 tests / 3,028 assertions; every production
  source file met the existing 80% coverage minimum. PHP 8.2 FPM smoke passed.
- [Release 39406635966](https://github.com/debugbundle/debugbundle-php/actions/runs/39406635966)
  passed its release gates and published the
  [v2.0.2 GitHub Release](https://github.com/debugbundle/debugbundle-php/releases/tag/v2.0.2).
- The GitHub tag and Packagist 2.0.2 source reference independently match the
  reviewed commit above. A separate fresh Composer install from Packagist passed
  exception, privacy, canonical wire-schema and browser-relay smoke checks.
- The improved installed smoke fails on the original SDK at the empty message
  constraint. Mock capture/log/spool state is isolated under the disposable
  consumer, and local runtime/config files are excluded from worktree smoke ZIPs.

## WordPress distribution

DebugBundle WordPress plugin 2.0.3 is published from
`04ac8e566a2909fb8bac293b3fe7c0e0826d400f`, bundling PHP SDK 2.0.2 and retaining
Browser SDK 3.0.3. The Composer lock changes only the PHP SDK package; every
other production/development dependency entry and the rebuilt browser asset
remain unchanged.

- [CI 39413413420](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/39413413420)
  passes PHP 8.2/8.3/8.4/8.5, static analysis, browser build, coverage and installed
  WordPress smoke. Local PHP verification passes 75 tests / 359 assertions;
  all 18 production plugin files meet the existing 80% coverage gate. The new
  regression fails against the previously bundled PHP 2.0.1 SDK.
- [GitHub publication 39413659808](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/39413659808)
  publishes [v2.0.3](https://github.com/debugbundle/debugbundle-wordpress/releases/tag/v2.0.3)
  after testing its exact ZIP. The downloaded ZIP matches its published checksum
  and all 34 bundled PHP source files match the reviewed published SDK source.
- [WordPress.org publication 39414001001](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/39414001001)
  independently tests its exact ZIP and commits SVN revision 3756546. The public
  directory API reports version 2.0.3 and serves that version's ZIP. All 221
  packaged file contents match the GitHub artifact byte for byte.
- A clean disposable WordPress 7.1.1/PHP 8.2 installation from the downloaded
  WordPress.org ZIP passes empty-message capture, canonical object maps, PHP
  suppression, authenticated remote policy, admin/backend delivery, browser
  relay credential isolation and outage/spool retry. Its containers and volumes
  are removed afterward. No existing WordPress site is updated.

GitHub ZIP SHA-256:
`2b2082189def42a77ac14021cfbf720a078d026ca0fef7c51c7163e295d83ca0`.
WordPress.org ZIP SHA-256:
`4ae8ce5d12f6073bc7a0154049f9fce3a672caced5ec64f2e283a07545e46b47`.
The ZIP container bytes differ; their file inventories and every file's bytes
are identical.

## Consumer adoption and consent

SayCheese production adoption and its exact application source, backups, served
assets and monitoring evidence are recorded in that application's release record.
Publication alone does not establish adoption. Historical malformed-rejection
totals are retained, and discarded payloads are not recovered by this patch.
