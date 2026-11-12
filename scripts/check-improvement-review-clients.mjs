import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

// Fresh installed bundles only; all requests target this synthetic loopback
// fixture. No credentials, customer evidence, mutations or providers are used.
const cli = resolve(process.argv[2]);
const mcp = resolve(process.argv[3]);
const execute = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "debugbundle-review-clients-"));
const auth = join(directory, "auth.json");
const organizationId = "11111111-1111-4111-8111-111111111111";
const reviewId = "22222222-2222-4222-8222-222222222222";
const token = "synthetic-member-token";
const observed = [];
const server = createServer((request, response) => {
  assert.equal(request.method, "GET");
  assert.equal(request.headers.authorization, `Bearer ${token}`);
  const url = new URL(request.url, "http://localhost");
  assert.ok(
    ["bundle", "plan"].some(
      (operation) =>
        url.pathname ===
        `/v1/organizations/${organizationId}/improvements/reviews/${reviewId}/${operation}`
    )
  );
  assert.equal(url.search, "");
  observed.push(url.pathname.split("/").at(-1));
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ bundle: null, status: "queued" }));
});
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await writeFile(auth, JSON.stringify({ base_url: origin, bearer_token: token }), { mode: 0o600 });
  for (const operation of ["bundle", "plan"]) {
    const { stdout } = await execute(
      process.execPath,
      [
        cli,
        "improvements",
        "reviews",
        operation,
        organizationId,
        reviewId,
        "--auth-file",
        auth,
        "--json"
      ],
      { cwd: directory, timeout: 30000 }
    );
    assert.deepEqual(JSON.parse(stdout), { bundle: null, status: "queued" });
  }
  const messages = [
    { jsonrpc: "2.0", id: "catalogue", method: "tools/list" },
    ...["get_improvement_review_bundle", "get_improvement_review_plan"].map((name, index) => ({
      jsonrpc: "2.0",
      id: `bundle-${index}`,
      method: "tools/call",
      params: { name, arguments: { bearerToken: token, organizationId, reviewId } }
    }))
  ];
  const child = execFile(process.execPath, [mcp], {
    cwd: directory,
    env: { ...process.env, DEBUGBUNDLE_API_URL: origin },
    timeout: 30000
  });
  const completed = new Promise((done, reject) => {
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? done(stdout) : reject(new Error(`review_mcp_failed:${code}:${stderr}`))
    );
  });
  child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  const responses = (await completed)
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const tools = responses.find((r) => r.id === "catalogue").result.tools;
  const tool = tools.find((tool) => tool.name === "get_improvement_review_plan");
  assert.equal(tool.inputSchema.properties.version, undefined);

  for (const id of ["bundle-0", "bundle-1"]) {
    const response = responses.find((r) => r.id === id);
    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, undefined);
    assert.deepEqual(JSON.parse(response.result.content[0].text), {
      bundle: null,
      status: "queued"
    });
  }
  assert.deepEqual(observed, ["bundle", "plan", "bundle", "plan"]);
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      cli: "pass",
      mcp: "pass",
      saved_export: "pass",
      review_plan: "pass",
      requests: observed.length
    }) + "\n"
  );
} finally {
  await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
