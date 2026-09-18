#!/usr/bin/env node

// Run in the disposable container from make claude-plugin-smoke. No model turn,
// host credentials, or customer API is used; authentication targets loopback.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

assert.ok(existsSync("/.dockerenv"), "Use make claude-plugin-smoke for an isolated home");
const exec = promisify(execFile);
const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(join(tmpdir(), "debugbundle-claude-"));
const marketplace = join(scratch, "marketplace");
const pluginPath = "apps/mcp/claude-code/debugbundle";
const plugin = JSON.parse(await readFile(join(source, pluginPath, ".mcp.json"), "utf8"));
const manifest = JSON.parse(
  await readFile(join(source, pluginPath, ".claude-plugin/plugin.json"), "utf8")
);
const server = plugin.mcpServers.debugbundle;
const authPath = join(homedir(), ".debugbundle/auth.json");
const clientVersion = process.env.CLAUDE_SMOKE_VERSION;
assert.ok(clientVersion, "Pin CLAUDE_SMOKE_VERSION");
let requests = 0;
let expectedToken = "synthetic-saved-member";
const api = createServer((request, response) => {
  requests++;
  assert.equal(request.method, "GET");
  assert.equal(request.url, "/v1/projects");
  assert.equal(request.headers.authorization, `Bearer ${expectedToken}`);
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ projects: [] }));
});

try {
  await mkdir(join(marketplace, ".claude-plugin"), { recursive: true });
  await cp(
    join(source, ".claude-plugin/marketplace.json"),
    join(marketplace, ".claude-plugin/marketplace.json")
  );
  await cp(join(source, pluginPath), join(marketplace, pluginPath), { recursive: true });
  await writeFile(
    join(scratch, "package.json"),
    JSON.stringify({ name: "claude-plugin-smoke", private: true })
  );
  await exec(
    "npm",
    [
      "install",
      "--prefix",
      scratch,
      "--no-package-lock",
      "--ignore-scripts",
      `@anthropic-ai/claude-code@${clientVersion}`,
      server.args[1]
    ],
    { cwd: scratch, timeout: 180000 }
  );
  await exec(
    process.execPath,
    [join(scratch, "node_modules/@anthropic-ai/claude-code/install.cjs")],
    { cwd: scratch, timeout: 180000 }
  );
  const claude = join(scratch, "node_modules/.bin/claude");
  const run = async (...args) =>
    (await exec(claude, args, { cwd: scratch, timeout: 60000 })).stdout;
  console.log((await run("--version")).trim());
  await run("plugin", "validate", join(marketplace, pluginPath));
  await run(
    "plugin",
    "marketplace",
    "add",
    process.env.CLAUDE_SMOKE_GITHUB === "1" ? "debugbundle/debugbundle" : marketplace
  );
  await run("plugin", "install", "debugbundle@debugbundle");
  const installed = await run("plugin", "list", "--json");
  assert.ok(installed.includes("debugbundle@debugbundle") && installed.includes(manifest.version));
  assert.ok(existsSync(join(marketplace, pluginPath, "skills/debugbundle/SKILL.md")));
  console.log(`Native Claude plugin validation and installation passed: ${manifest.version}`);

  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify({ bearer_token: expectedToken, base_url: apiUrl }), {
    mode: 0o600
  });

  // Execute the exact packaged command with resolved optional user settings.
  // Native installation above is separate from this protocol-level auth proof.
  async function exchange(settings, messages) {
    const env = {
      ...process.env,
      PATH: `${join(scratch, "node_modules/.bin")}:${process.env.PATH}`
    };
    for (const [key, value] of Object.entries(server.env)) {
      env[key] = value.replace(/\$\{user_config\.([^}]+)\}/gu, (_, name) => settings[name] ?? "");
    }
    const child = spawn(server.command, server.args, {
      cwd: scratch,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60000);
    try {
      child.stdin.end(
        messages
          .map((message, index) => JSON.stringify({ jsonrpc: "2.0", id: index + 1, ...message }))
          .join("\n") + "\n"
      );
      const [code] = await once(child, "close");
      assert.equal(code, 0, stderr);
      const replies = stdout
        .trim()
        .split(/\r?\n/u)
        .map((line) => JSON.parse(line));
      assert.equal(replies.length, messages.length);
      // JSON-RPC responses may finish out of order while an HTTP call is pending.
      return replies.sort((left, right) => left.id - right.id);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  const listProjects = { method: "tools/call", params: { name: "list_projects", arguments: {} } };
  const [catalog, saved, injected] = await exchange({}, [
    { method: "tools/list" },
    listProjects,
    {
      method: "tools/call",
      params: { name: "list_projects", arguments: { bearerToken: "synthetic-injected" } }
    }
  ]);
  assert.ok(catalog.result.tools.length > 0);
  for (const tool of catalog.result.tools)
    assert.ok(!("bearerToken" in tool.inputSchema.properties));
  assert.ok(!saved.error && !saved.result.isError, JSON.stringify(saved));
  assert.ok(injected.error || injected.result?.isError, "Per-call credential must be rejected");
  assert.equal(requests, 1);
  // A stale saved endpoint must not override the explicitly configured API host.
  await writeFile(
    authPath,
    JSON.stringify({ bearer_token: expectedToken, base_url: "http://127.0.0.1:1" }),
    { mode: 0o600 }
  );
  expectedToken = "synthetic-plugin-member";
  const [configured] = await exchange({ member_token: expectedToken, api_url: apiUrl }, [
    listProjects
  ]);
  assert.ok(!configured.error && !configured.result.isError, JSON.stringify(configured));
  assert.equal(requests, 2);
  await rm(authPath);
  const [missing] = await exchange({ api_url: apiUrl }, [listProjects]);
  assert.ok(missing.result.isError);
  assert.ok(JSON.stringify(missing).includes("mcp_tool_error:auth_state_missing"));
  assert.equal(requests, 2, "Missing credentials must fail before HTTP");
  console.log(
    `${catalog.result.tools.length} tools; saved login, plugin settings precedence, credential rejection and missing-auth checks passed`
  );
  await run("plugin", "uninstall", "debugbundle@debugbundle");
  assert.ok(!(await run("plugin", "list", "--json")).includes("debugbundle@debugbundle"));
  console.log("Native plugin removal passed; no model turn or customer API request made");
} finally {
  await new Promise((resolve) => api.close(resolve));
  await rm(authPath, { force: true });
  await rm(scratch, { recursive: true, force: true });
}
