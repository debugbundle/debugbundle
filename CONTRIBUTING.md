# Contributing

## Development Workflow

1. Create a feature branch from `main`.
2. Implement using Red/Green TDD.
3. Run local checks:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. Update docs and contracts when behavior/interfaces change.
5. Open a pull request with test evidence.

## Rules

- Follow `AGENTS.md` and all files in `rules/`.
- Keep apps/package boundaries strict (`apps` may import `packages`; reverse is forbidden).
- Do not add backwards-compatibility shims during pre-production.
