# Local operator tooling

Application dependencies, package builds, tests and runtime services continue to
use Docker-backed Make targets with the repository's pinned pnpm 11.3.0.

The existing host-installed DebugBundle operator CLI is a narrow exception. It
uses the host's Node 26.0.0 and npm 11.12.1 to install exactly
`@debugbundle/cli@1.30.0` through `make debugbundle-cli-update`. Installation
disables lifecycle scripts and does not install application dependencies, modify
credentials, connect projects or install another agent interface.

Use `make debugbundle-guidance-refresh` to repair managed repository guidance
from the current source templates, and `make debugbundle-guidance-check` to
validate guidance and the profile. Both execute in Docker and preserve customised
scaffold conflicts for review. Hosted diagnostics use the operator CLI's existing
saved authentication; do not mount host credentials into maintenance containers.

`make debugbundle-sdk-check` checks the installed API/worker, dashboard and site
SDK artifacts with synthetic custom transports in a container without network
access. It verifies capture, delivery, SDK identity, exact-key redaction and
mandatory password redaction. Run the companion site's install target first.
