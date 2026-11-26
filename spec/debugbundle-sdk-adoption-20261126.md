# DebugBundle SDK and agent-guidance adoption — 26 November 2026

Scope: DebugBundle's own SDK consumers, local operator CLI, repository profile
and managed agent guidance. The owner authorised core 1.32.1 and site 1.13.1
publication and deployment; see [the release plan](release-1.32.1.md) for current
qualification and production receipts. No consumer product is changed.

Requirements: FR-PROF-10/13 and AC-PROF-02/03/04 cover the reviewed profile and
managed guidance. FR-EVT-07c/08d and AC-EVT-08g cover the scoped resource rule.
Existing SDK transport, privacy, host-safety and relay contracts remain binding.

## SDK applicability

| Surface                                                                                                   | Adoption and verification                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node, including API/worker adapters and API browser relay                                                 | Adopt published 3.3.0 through the root dependency and lockfile. Check dogfooding and relay tests, installed capture/privacy behaviour and core typecheck.                                        |
| Browser, including dashboard and public site                                                              | Adopt published 3.3.0 in both independently locked consumers. Check dogfooding/consent tests, installed capture/privacy behaviour, typechecks and production builds.                             |
| PHP, WordPress, Python, Go, Rust, Ruby, Java, .NET, Android, Swift and React Native (both native bridges) | Not installed in DebugBundle's own applications; no SDK source or distribution changes. Their independent exact-key/protocol-privacy release evidence remains in the 25 November release record. |

This is consumer adoption of existing releases, not a new cross-SDK capability.
Existing payout privacy fields remain broad where required; no standalone `tag`
redaction setting needs migration. Shared types 3.9.0, redaction 2.8.0 and
CLI/MCP 1.30.0 remain the current independently published versions. Only the
existing host CLI installation needed upgrading, from 1.26.0 to 1.30.0.

The profile was reviewed against core API/worker/web/CLI/MCP sources, the
companion site's Next.js routes and Docker-backed Make targets. Codex discovers
the canonical `.agents/skills/debugbundle` directory; no additional agent
integration or credential setup is introduced.

## Production noise policy

The owner confirmed the resource incident as false. The existing suggestion was
read again, checked for exact project/service/environment/resource scope, applied
through CLI 1.30.0 and verified by rule-list readback:

- Project: `bd9e7adf-31a4-4bb7-a0af-2f079cab2e3b` (DebugBundle).
- Rule: `98e3acd3-1d58-4817-9018-3c7de8394bb6`, enabled `threshold`.
- Scope: `Site`, `production`, opaque `frontend_exception` / `resource_error`,
  target `link`, exact `debugbundle.com/images/hero-bg.webp`.
- Gate: 10 events in 3,600 seconds, grouped by resource.
- Incident: `ae753c23-0416-464c-85c3-ec2bc1ad6afd`, resolved after saving the rule.
- Readback: 3 open, 2 regressed, 94 resolved, compared with 3/3/93 beforehand.

The rule retains transient evidence and allows sustained failures to open an
incident. Existing favicon/extension demotions, OAuth/MCP incidents and capture
preset remain unchanged. No production synthetic events were generated. A saved
rule and resolved record do not establish future rule effectiveness; observe
subsequent natural matches before claiming a measured reduction.

## Local qualification

- Docker dependency installs passed for core and site; both lockfiles change only
  SDK 3.3.0 and their shared-package graph (redaction 2.8.0/shared-types 3.9.0).
- Managed guidance refresh/check and profile validation passed. Host CLI 1.30.0
  reports a healthy doctor result, including authenticated cloud access and a
  fresh profile.
- Ten focused core test files passed all 102 tests: API/worker/browser dogfooding,
  browser flows, agent setup/safety, profile validation and resource thresholds.
- Core and site typechecks passed. The site passed all 137 tests and its webpack
  static export, including generated artifacts and exported-page checks.
- The dashboard production build passed. No browser or device acceptance was
  performed or required for this dependency-only adoption.
- `make debugbundle-sdk-check` passed for each installed API/worker, dashboard
  and site artifact in a container without network access, checking exception
  capture, acknowledged delivery, SDK version and private-field redaction.
- Focused script lint and formatting checks passed; existing SDK configuration,
  consent, relay and credential boundaries remain unchanged.

## Production qualification

Core 1.32.1 and site 1.13.1 are published and live. The
[release receipt](release-1.32.1.md) records the exact source CI, canonical
releases, hosted workflow, immutable image and rollback pair. Both live
containers report Node SDK 3.3.0; the served dashboard and site SDK chunks
contain Browser 3.3.0 and no 3.2.4 version literal. The dashboard build ID matches
the core release commit. Public API/MCP readiness, all three existing endpoint
monitors and authenticated CLI doctor checks pass.

Post-deployment readback confirms the same incident lifecycles and enabled
10-per-hour resource threshold, with zero natural matches so far. The optional
GitHub repository read returns `404:installation_not_found`; no integration
configuration was changed. No production synthetic capture or browser/device
acceptance is claimed. Existing SDK, CLI and MCP distribution versions are retained.
