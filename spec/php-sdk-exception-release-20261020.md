# PHP exception-envelope patch — 20 October 2026

The owner authorized publication and the SayCheese consumer release after local
review. PHP SDK 2.0.2 is published from
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

## Consumer adoption

SayCheese production adoption and its exact application source, backups, served
assets and monitoring evidence are recorded in that application's release record.
Publication alone does not establish adoption. Historical malformed-rejection
totals are retained, and discarded payloads are not recovered by this patch.
