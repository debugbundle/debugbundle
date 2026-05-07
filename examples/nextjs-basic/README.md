# Next.js Basic

Minimal Next.js App Router example showing both server-side and browser-side DebugBundle wiring.

## What It Shows

- Node SDK initialization for App Router server handlers
- Browser SDK initialization for a client-side error trigger
- A server route and browser action you can inspect with the CLI

## Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in your project token.
3. Start the app with `pnpm dev`.
4. Visit `http://localhost:3007` and use either the browser trigger or `GET /api/demo`.

## Verify With The CLI

1. Run `debugbundle setup --non-interactive`.
2. Trigger one of the sample errors.
3. Inspect the incident with `debugbundle inspect <incident-id>`.

## Files

- `lib/debugbundle-server.ts` initializes the Node SDK.
- `lib/debugbundle-browser.ts` initializes the browser SDK.
- `app/api/demo/route.ts` triggers a server-side error path.
- `app/page.tsx` exposes a client-side trigger.