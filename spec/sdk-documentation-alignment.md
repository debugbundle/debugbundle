# SDK documentation alignment

Scope: FR-DOC-14, FR-DOC-01/06/07/12, FR-SDK-12 and AC-DOC-03/10.
Documentation preparation covers DebugBundle core, site, organisation profile
and its SDK repositories, preserving SDK APIs and runtime behaviour. The Owner
authorised coordinated patch publication on 15 November; version metadata and
wrapper dependency pins follow that independent release process. Current release
identities and acceptance are recorded in [the release record](release-20261115.md).

## Shared pattern

The normative pattern is [SDK interface §14](../contracts/sdk-interface.md#14-sdk-documentation-and-examples):
Installation → Initialize → Integrations → First-event verification → Configuration.
The main README, homepage and connected installation/quickstart panels use the same
minimal examples. Individual SDK guides and package READMEs use those initialization
examples and retain detailed framework, transport, lifecycle and safety guidance.
The JavaScript family README presents its Node.js and Browser packages in that flow.

Catalogue order is Node.js, Browser, Python, PHP, Rust, Java, .NET, Go, Ruby,
Android, iOS, React Native, WordPress. Package columns contain identifiers; version
and registry details are separate. Existing guide heading anchors are preserved.
Historical release notes and qualification receipts retain their original meaning.

## Applicability and runtime exceptions

| Surface | Initialization and required context | Details retained separately |
| --- | --- | --- |
| Node.js | Singleton init with server environment token; automatic process hooks | Framework middleware, logger adapters, relay and bounded lifecycle |
| Browser | Instance init with explicit credential-free relay mode | Backend route prerequisite, direct-cloud alternative, native capture and best-effort unload |
| Python | Module init with server environment token; automatic exception hooks | Logging, Django/Flask/FastAPI, relay, manual capture and teardown |
| PHP | Init after Composer autoload; automatic error/exception/shutdown hooks | Laravel/Symfony/Monolog, relay and request-end delivery limits |
| Rust | Retained `debugbundle::init(Config { … })` with explicit token, environment and service | Explicit panic guard, feature-gated adapters, local mode, acknowledgements and bounded flush/shutdown |
| Java | Spring Boot starter and `application.yml` | Core/servlet/JAX-RS/agent alternatives, BOM, relay and lifecycle |
| .NET | ASP.NET Core service registration and request middleware | Optional logger/relay/packages, worker/native alternatives and hosted shutdown |
| Go | Retained client inside application startup with v3 module import | net/http/Gin/Echo/logging adapters, relay and bounded controlled flush |
| Ruby | Singleton init with server environment token; automatic exception hooks | Rack/Rails/Sidekiq/loggers, relay, fork ownership and teardown |
| Android | Registered Application startup and app-defined BuildConfig field | Desugaring/native floor, optional modules, app-private queues and crash replay |
| iOS | App startup, package target and Info.plist configuration | SwiftUI/UIKit, optional package products, immutable Git-pod alternative and native queues |
| React Native | App-entry init with explicit app build configuration | Bare/Expo native prerequisites, public token semantics, native bridges and Expo Go limits |
| WordPress | Plugin installation, activation and administrator settings | Bundled PHP/browser capture, relay, WP-Cron, settings and separate test-event buttons |

All rows apply to the documentation pattern and were updated. This record does not
assert new runtime parity or resolve unrelated SDK safety work. Existing runtime
limitations and release gates continue to apply.

Source review corrected stale Python/PHP local-only guidance. Their built-in
application clients create HTTP transports, while their browser relay implementations
support local files. Neither a literal `local` token nor the Python guide's former
`transport`/`local_events_dir` init options selects backend file delivery. The public
quickstart, configuration and capability tables now state that limitation. Backend
file-transport parity would require a separately scoped runtime change; it is not
implemented or claimed by this documentation patch. Python's synchronous flush and
current configuration defaults are also reflected in the guide.

## Verification

- `tests/contracts/sdk-documentation.test.ts` covers all main README examples,
  homepage and connected tab examples, guide/README section order, matching initial
  snippets, catalogue order and the shared contract. The strict local gate requires
  the site and all SDK checkouts; public core CI can run without private repositories.
- `tests/contracts/rust-sdk-public-docs.test.ts` retains stable Rust discovery,
  publication wording and local verification checks while requiring init-only homepage code.
- Site CI includes both checks against public core contracts. Release coordination
  must make the new core contract test available before that site CI change runs.
- Reordered headings are checked against the original anchors. Changed examples
  are checked against current public SDK source; Rust's existing example suite is
  compiled through its Docker-backed `make examples` target.
- The site is tested, statically built and typechecked through `make check-isolated`.
  Source/content checks and a local build do not establish deployed content or
  consumer acceptance.

Local verification on 2026-11-14: the strict gate passed all 38 checks; the wider
public-site contract suite passed 54 checks; all 98 site tests, static export and
site typecheck passed. Core typecheck and focused ESLint passed. Rust's existing
examples compiled with all features. Comparing 33 changed Markdown/MDX documents
against their original headings found no lost anchors. Logs and the initial
failing test run are retained under `.tmp/sdk-documentation-alignment/`.

The final review covered documentation inventory, credentials and transport
claims, required native/framework setup, retained client lifetime, bounded
verification, old links and CI checkout behaviour. No database, API, runtime,
dependency, infrastructure or consumer changes are included. All 15 repository
HEADs remained at their starting commits at the end of that preparation; subsequent
authorised patch release work is recorded separately.

The documentation preparation itself performed no publication or deployment.

Local preview follow-up: the nginx preview at `http://localhost:5292` was still
serving an older alpha export after isolated qualification. `make dev-public-refresh`
rebuilt the real export and remounted that preview. HTTP checks now match the current
export bytes for the homepage, Rust guide, installation and quickstart; all contain
the public `debugbundle::init` example and no Rust alpha version.
The docs sidebar now uses the homepage's existing SDK icons, verified in served HTML
and covered by the 38-check documentation gate. This is local preview verification,
not a production deployment.

Explicit configuration follow-up: Rust now shows `project_token`, `environment`
and `service` directly in the introductory `Config` value, in the same order as
the other server SDKs. `Config::from_env()` remains a configuration-reference
alternative. Local-only setup shows mode, environment and service explicitly.
The exact connected README snippet compiles against SDK 1.0.0 in an offline Docker
consumer; all 38 documentation checks and focused lint pass. The rebuilt local
preview's four entry pages were verified against the complete explicit snippet.
