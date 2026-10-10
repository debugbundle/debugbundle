import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConfigEnv, Plugin } from "vite";

import { createDevMockApi } from "../../scripts/dev-mock/api.js";

export function devMockEnabled(
  command: ConfigEnv["command"],
  mode: string,
  env: NodeJS.ProcessEnv
): boolean {
  if (env["DEBUGBUNDLE_DEV_MOCK"] !== "true") return false;
  if (command !== "serve" || mode !== "development") return false;
  if (env["NODE_ENV"] === "production") throw new Error("Local mock API cannot run in production.");
  return true;
}

function isLocalRequest(request: IncomingMessage): boolean {
  const host = request.headers.host ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}`;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size <= 65536) chunks.push(buffer);
  }
  if (size > 65536) throw new Error("body_too_large");
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : undefined;
}

export function devMockPlugin(): Plugin {
  return {
    name: "debugbundle-local-mock-api",
    apply: "serve",
    configureServer(server) {
      // Registered before Vite's proxy: unknown mock routes never reach a real API.
      server.middlewares.use(createDevMockMiddleware());
    }
  };
}

export function createDevMockMiddleware() {
  const api = createDevMockApi();
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    if (!request.url?.startsWith("/v1") && !request.url?.startsWith("/debugbundle")) {
      next();
      return;
    }
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify(body));
    };
    if (!isLocalRequest(request)) {
      send(403, { error: "local_mock_only" });
      return;
    }
    void respond(request, response).catch(() => {
      if (!response.headersSent) send(400, { error: "invalid_mock_request" });
    });
    async function respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const payload = await readBody(req);
      const result = api.handle(
        req.method ?? "GET",
        req.url ?? "/",
        payload,
        `http://${req.headers.host}`
      );
      for (const [key, value] of Object.entries(result.headers ?? {})) res.setHeader(key, value);
      if (!res.destroyed) send(result.status, result.body);
    }
  };
}
