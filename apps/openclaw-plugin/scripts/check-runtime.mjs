import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// Import the emitted ESM in native Node, without a TypeScript/CommonJS loader
// that can hide unsupported dynamic requires in bundled dependencies.
const entry =
  process.argv[2] === undefined
    ? new URL("../dist/index.js", import.meta.url).href
    : pathToFileURL(resolve(process.argv[2])).href;
const { default: plugin, DEBUGBUNDLE_OPENCLAW_TOOL_NAMES: names } = await import(entry);
const originalCwd = process.cwd();
const root = await mkdtemp(join(tmpdir(), "debugbundle-openclaw-runtime-"));
const requests = [];
const server = createServer((request, response) => {
  requests.push({
    url: request.url,
    method: request.method,
    authorization: request.headers.authorization
  });
  const url = new URL(request.url, "http://127.0.0.1");
  const nextCursor =
    url.searchParams.has("limit") || url.searchParams.has("cursor") ? null : "fixture-page-2";
  const body = gzipSync(JSON.stringify({ incidents: [], next_cursor: nextCursor }));
  response.setHeader("content-type", "application/json");
  response.setHeader("content-encoding", "gzip");
  response.setHeader("content-length", body.length);
  response.end(body);
});

try {
  await mkdir(join(root, ".debugbundle/local"), { recursive: true });
  await writeFile(
    join(root, ".debugbundle/local/connection.json"),
    JSON.stringify({
      mode: "connected",
      cloud_project_id: "00000000-0000-4000-8000-000000000001"
    })
  );
  process.chdir(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const tools = new Map();
  const hooks = new Map();
  plugin.register({
    pluginConfig: { apiBaseUrl: `http://127.0.0.1:${server.address().port}` },
    on: (name, handler) => hooks.set(name, handler),
    registerTool: (tool) => tools.set(tool.name, tool)
  });
  assert.equal(tools.size, names.length);
  assert.equal(typeof hooks.get("before_tool_call"), "function");
  const result = await tools.get("debugbundle_list_incidents").execute("fixture-call", {
    source: "cloud",
    bearerToken: "synthetic-member-token",
    limit: 2
  });
  assert.deepEqual(JSON.parse(result.content[0].text), { incidents: [], next_cursor: null });
  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url, "http://127.0.0.1");
  assert.equal(url.pathname, "/v1/incidents");
  assert.equal(url.searchParams.get("project_id"), "00000000-0000-4000-8000-000000000001");
  assert.equal(url.searchParams.get("limit"), "2");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].authorization, "Bearer synthetic-member-token");

  const merged = await tools.get("debugbundle_list_incidents").execute("fixture-merged", {
    bearerToken: "synthetic-member-token"
  });
  assert.deepEqual(JSON.parse(merged.content[0].text), { incidents: [], next_cursor: null });
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(
      new URL(request.url, "http://127.0.0.1").searchParams.get("project_id"),
      "00000000-0000-4000-8000-000000000001"
    );
  }
  assert.equal(
    new URL(requests[2].url, "http://127.0.0.1").searchParams.get("cursor"),
    "fixture-page-2"
  );
  const approval = hooks.get("before_tool_call")({ toolName: "debugbundle_resolve_incident" });
  assert.equal(approval.requireApproval.timeoutBehavior, "deny");
  assert.deepEqual(approval.requireApproval.allowedDecisions, ["allow-once", "deny"]);
  await writeFile(
    join(root, ".debugbundle/local/connection.json"),
    JSON.stringify({ mode: "connected" })
  );
  await assert.rejects(
    tools.get("debugbundle_list_incidents").execute("fixture-invalid", {
      source: "cloud",
      bearerToken: "synthetic-member-token"
    }),
    /invalid_local_connection_config/u
  );
  assert.equal(requests.length, 3);
  console.log(
    `OpenClaw native ESM runtime passed on ${process.version}: ${tools.size} tools, compressed scoped pagination, approval and fail-closed checks.`
  );
} finally {
  process.chdir(originalCwd);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
