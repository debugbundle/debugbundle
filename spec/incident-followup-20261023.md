# App and Site incident follow-up — 23 October 2026

## Scope correction

The earlier maintenance release and incident closure queried the connected **DebugBundle API** project. Its 44 incidents were independently resolved, but the statement that all DebugBundle cloud incidents were clear was too broad. The owner confirmed that **DebugBundle App** and **DebugBundle Site** also belong in this task. Their inventories contained 17 and six active incidents respectively, without further pages. Consumer products remain outside the authorised scope.

CLI 1.17.0 remains verified registry latest. `validate --fix` reports healthy setup with no errors or warnings. All 23 newly included incident summaries, explanations, redacted bundles and available reproductions are retained in ignored operational notes before changes.

## Classification and disposition

- Ten incidents have entirely browser-extension stack frames: seven `M_ID` groups, one extension XHR error, one extension SSE error and one MetaMask error. Exact-fingerprint demotion rules additionally constrain service, production environment, browser runtime and frontend event type. All ten rules were independently read back before those incidents were resolved. Matching diagnostics remain context; nothing is dropped.
- One favicon incident is resolved after an independent HTTP 200, SVG content-type and nonempty asset readback. No rule suppresses application-asset failures.
- One anonymous evaluated-script reference error is absent from all 40 compiled first-party site JS assets. An exact-fingerprint/message/type rule is restricted to the captured hidden-page window-error state and retains context. Extension identity is not established. A host-wide window-error suggestion was rejected because it would suppress first-party failures.
- Seven App DOM ownership failures, three App fetch failures and one Site malformed-path failure remain open until release verification. No rules demote these application failures.

## Reproduced defects and prepared fixes

Core **1.19.2** and site **1.6.9** are prepared on `main` under the existing release authorisation. The owner explicitly approved reuse of the existing notice/callout/button system for visible errors, retry, loading and accessibility.

Session and initial billing reads previously rejected promises without a terminal handler. The captured fetch stacks identify `/v1/auth/session` and `/v1/billing` loaders in the exact historical served assets. A failed session read now remains distinct from confirmed sign-out; retries are deduplicated. Explicit refresh retains its rejection contract and an established session. The shared error component reuses existing tokens and primitives.

The extracted billing checkout-sync hook retains prior data, the existing revision fence, cancellation and saved Checkout context. Read/poll failure displays a recoverable error; retry reconciles the same session rather than creating another purchase. Existing helper exports are preserved. No provider policy, payment service or schema change is involved.

A translator-style text-node replacement reproduces the same DOM exception class in the shared loading-button pattern. Stable label elements prevent conditional icons from inserting/removing relative to displaced text. The auth submit button uses the same boundary. Translation stays enabled; no global DOM patch or general DOM-error suppression is added. This pattern is consistent with the [upstream React DOM-mutation issue](https://github.com/facebook/react/issues/11538), but the retained historical bundles do not identify which browser tool changed those pages.

The public-site edge handler normalizes repeated and raw-backslash path separators before its existing canonical redirect. `//robots.txt` becomes an origin-relative `/robots.txt` redirect instead of a malformed app-router URL. Query values, encoded separators and asset-path rules remain intact. Cloud deployment ownership stays in the private companion.

## Verification and release state

The session, billing and translated-label regressions failed before their fixes. Initial focused verification passes 77 tests and full typecheck; additional retained-data polling, auth translation and concurrency cases are included in the final gate. The full coverage suite, lint, site checks and final release qualification are in progress. Site-edge tests cover canonical paths, malformed network-path-like inputs, query preservation, static error behaviour and distribution configuration.

No new schema, external distribution version or frozen OpenAI wire contract is introduced. Existing reviewer login/23 November expiry and OpenAI portal review/publication boundaries remain unchanged. No production payment, email or consumer canary is authorised by this document. Exact source identities, deployed proof and multi-project final incident readback must be recorded after shipping; this preparation record is not a deployment receipt.

## Compatible security follow-up — 24 October

Exact-source CI exposed GHSA-mrhx-c7xc-m3w5 before publication. Standalone Zod 4
paths move to official 4.6.6; the retained Zod 3.25.76 interface uses a managed
collection-bound backport, including its bundled v4 entry. The owner approved
the exact core/site audit exception after automatic review requested explicit
approval. Registry version findings remain visible and are accounted for only
after installed hash and semantic verification. Other findings still block at
the original severity. See `rules/release-governance.md` for the fail-closed gate.
No public SDK schema API or package version changes with this local install fix.

A separate API OAuth token failure regressed at 22:00 UTC on 23 October. It
remains open pending diagnosis/recovery proof, independently of the eleven
App/Site application failures. Runtime availability alone does not prove an
authenticated connection has recovered.

## Fresh release gate — 24 October morning

After the owner reviewed the UI recovery states and explicitly reauthorised
production, the canonical 1.19.2 release audit found two newly reported high
findings. It stopped before GitHub release creation or production deployment.
The immutable failed tag remains unchanged. Replacement core **1.19.3** retains
the reviewed application changes and updates body-parser 2.x to 2.4.0 and all
Undici 8.x paths to at least 8.12.2 (direct dependency resolves 8.12.3).
Site **1.6.10** refreshes its generated reference version. No new UI, authentication
policy, schema or consumer-product change is added. The existing exact Zod
backport exception and every other audit severity threshold remain unchanged.

The preceding complete local run passed 4,668 tests across 566 files/100 shards
and the unchanged changed-source coverage gate for all six runtime files. The
replacement must pass its fresh audit, focused transport/security tests and
exact-source CI before publication/deployment. A fresh App occurrence contains
only extension frames; its separate exact App/production/browser fingerprint
rule retains context and is independently verified before closure. Eleven
App/Site application incidents and the separate OAuth failure remain open until
their respective production recovery conditions are demonstrated.

## Final deployed checkpoint

Core 1.19.3/site 1.6.10 are now deployed and all four DebugBundle projects have
zero active incidents on independent paginated readback. OAuth token exchange
and authenticated MCP reads have recovered. See
[the 24 October release receipt](incident-followup-release-20261024.md) for exact
sources, image identities, qualification and limits. Preparation states above
are historical; OpenAI portal publication remains a separate gate.
