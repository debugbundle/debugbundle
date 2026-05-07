# Express Basic

Minimal Express example wired to DebugBundle's Node SDK.

## What It Shows

- SDK init in a plain Express server
- Explicit error capture plus request middleware wiring
- A simple path to inspect the resulting incident with the CLI

## Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and fill in your project token.
3. Start the app with `pnpm start`.
4. Visit `http://localhost:3005/boom` to trigger an example failure.

## Verify With The CLI

1. Run `debugbundle setup --non-interactive` in the repo you want to inspect from.
2. Trigger the sample error.
3. List or inspect the incident with `debugbundle inspect <incident-id>`.

## Files

- `server.mjs` contains the Express server and DebugBundle SDK initialization.
- `.env.example` documents the required runtime variables.