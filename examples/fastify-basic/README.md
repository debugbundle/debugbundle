# Fastify Basic

Minimal Fastify example wired to DebugBundle's Node SDK.

## What It Shows

- SDK init in a plain Fastify server
- Framework middleware/plugin integration
- A reproducible failing route you can inspect from the CLI

## Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and fill in your project token.
3. Start the app with `pnpm start`.
4. Visit `http://localhost:3006/boom` to trigger an example failure.

## Verify With The CLI

1. Run `debugbundle setup --non-interactive`.
2. Trigger the sample error.
3. Inspect the resulting incident with `debugbundle inspect <incident-id>`.

## Files

- `server.mjs` contains the Fastify server and DebugBundle SDK initialization.
- `.env.example` documents the required runtime variables.