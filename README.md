# DebugBundle

Production debugging bundles for AI agents.

Source-of-truth product repository: https://github.com/debugbundle/debugbundle

![CI](https://img.shields.io/github/actions/workflow/status/debugbundle/debugbundle/ci.yml?branch=main&label=ci)
![npm](https://img.shields.io/npm/v/%40debugbundle%2Fsdk-node?label=sdk-node)
![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)
![Community](https://img.shields.io/badge/community-GitHub%20Discussions-black)

## What Is DebugBundle?

DebugBundle captures production failures from backend and browser applications, turns them into deterministic debug bundles, and exposes those bundles through API, CLI, and MCP. The platform is designed for agent-native investigation while remaining usable for operators and developers who want the same incident surface across every interface.

## Key Features

- Deterministic failure and improvement bundles for a single incident.
- API, CLI, and MCP parity for retrieval, lifecycle, and automation workflows.
- Local-first onboarding with connected cloud upgrade paths.
- Self-hostable Compose stack for hosted-parity development and evaluation.
- SDK coverage for Node and browser now, with Python and PHP tracked in-repo pre-launch.

## Quick Start

1. Start the local stack with `make infra-up`.
2. Bootstrap the database and S3 bucket with `make infra-bootstrap`.
3. Run `make dev` to bring up the API, worker, and web app.
4. Add SDK wiring to an app or start from one of the example apps in `examples/`.
5. Verify the end-to-end flow with `debugbundle setup --non-interactive` and `debugbundle inspect <incident-id>`.

Useful local runtime notes:

- `make dev` requires `DEBUGBUNDLE_PROBE_TRIGGER_SECRET` in `.env`.
- `make dev` exposes the web app on `http://localhost:5291`.
- `WORKER_RUN_ONCE=1 make worker-run` is useful for single-pass verification.
- Local GitHub auth can run in mock mode by default, or with real OAuth env vars when configured.
- `make dev` will read both `.env` and `.env.local` when `.env.local` exists, so local-only OAuth and AWS email credentials can stay out of the shared `.env` baseline.

## Documentation

- System overview: `SYSTEM_OVERVIEW.md`
- Architecture map: `ARCHITECTURE_MAP.md`
- Requirements: `spec/requirements.md`
- Acceptance criteria: `spec/acceptance.md`
- Public interfaces: `contracts/public-interfaces.md`
- Public site repository: `https://github.com/debugbundle/site`
- Local companion site clone: `site/` when cloned alongside the core repo

## Self-Hosting

Use `deploy/selfhost/docker-compose.yml` and `deploy/selfhost/README.md` for the supported self-host bootstrap flow. The Compose stack includes Postgres, Redis, LocalStack S3, the API, the worker, and the web app with documented readiness and smoke-check behavior.

## Contributing

Contribution expectations, validation steps, and repository rules live in `CONTRIBUTING.md`.

## License

DebugBundle is licensed under AGPL-3.0-only. The repository includes the full license text in `LICENSE`, and self-hosted or modified networked deployments must preserve the corresponding source obligations of AGPL section 13.
