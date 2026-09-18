#!/usr/bin/env node

// Run only in the disposable container from make codex-plugin-smoke. No model
// turn or production API call is made; the auth exercise uses a loopback fixture.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLocalRetrievalFixture } from "../tests/helpers/local-retrieval-fixture.ts";

assert.ok(
  existsSync("/.dockerenv"),
  "Use make codex-plugin-smoke for an isolated home and network environment"
);
const exec = promisify(execFile);
const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(join(tmpdir(), "debugbundle-codex-"));
const codexVersion = process.env.CODEX_SMOKE_VERSION ?? "0.153.1";
const useGitHub = process.env.MCP_SMOKE_GITHUB === "1";
assert.ok(
  !useGitHub || process.env.MCP_SMOKE_CANDIDATE !== "1",
  "GitHub smoke requires the published MCP artifact"
);
const plugin = JSON.parse(
  await readFile(join(source, "plugins/debugbundle-codex/.mcp.json"), "utf8")
);
const mcpSpec = plugin.mcpServers.debugbundle.args[1];
const mcpTarball =
  process.env.MCP_SMOKE_CANDIDATE === "1"
    ? join(source, ".tmp/codex-plugin", `debugbundle-mcp-${mcpSpec.split("@").at(-1)}.tgz`)
    : null;
const marketplace = join(scratch, "marketplace");
const project = join(scratch, "application");
const codexHome = join(scratch, "codex-state");
const syntheticToken = "codex-smoke-synthetic-member";
let requests = 0;
let rpc;
const api = createServer((request, response) => {
  requests++;
  assert.equal(request.method, "GET");
  assert.equal(request.url, "/v1/projects");
  assert.equal(request.headers.authorization, `Bearer ${syntheticToken}`);
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ projects: [] }));
});

function appServer(command, env) {
  const child = spawn(command, ["app-server"], {
    cwd: project,
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const pending = new Map();
  let sequence = 0;
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  child.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
  });
  child.on("exit", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(`codex_app_server_exited:${stderr}`));
    }
    pending.clear();
  });
  return {
    call(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`codex_rpc_timeout:${method}:${stderr}`));
        }, 60000);
        pending.set(id, { resolve, reject, timeout });
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    },
    notify(method) {
      child.stdin.write(`${JSON.stringify({ method, params: {} })}\n`);
    },
    async close() {
      lines.close();
      child.stdin.end();
      if (child.exitCode !== null) return;
      await new Promise((resolve) => {
        const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
  };
}

try {
  await mkdir(codexHome);
  await mkdir(join(marketplace, ".agents/plugins"), { recursive: true });
  await cp(
    join(source, ".agents/plugins/marketplace.json"),
    join(marketplace, ".agents/plugins/marketplace.json")
  );
  await cp(
    join(source, "plugins/debugbundle-codex"),
    join(marketplace, "plugins/debugbundle-codex"),
    { recursive: true }
  );
  // Both catalogs coexist in the public repository. Codex must choose its own.
  await cp(join(source, ".claude-plugin"), join(marketplace, ".claude-plugin"), {
    recursive: true
  });
  await cp(
    join(source, "apps/mcp/claude-code/debugbundle"),
    join(marketplace, "apps/mcp/claude-code/debugbundle"),
    { recursive: true }
  );
  const fixture = await createLocalRetrievalFixture();
  await cp(fixture.rootDirectory, project, { recursive: true });
  await rm(fixture.rootDirectory, { recursive: true });
  await writeFile(
    join(scratch, "package.json"),
    JSON.stringify({ name: "codex-plugin-smoke", private: true })
  );
  console.log(
    `Installing isolated clients: Codex ${codexVersion}, ${mcpSpec} (${mcpTarball ? "candidate tarball" : "npm registry"})`
  );
  await exec(
    "npm",
    [
      "install",
      "--prefix",
      scratch,
      "--no-package-lock",
      "--ignore-scripts",
      `@openai/codex@${codexVersion}`,
      mcpTarball ?? mcpSpec
    ],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  );
  const codex = join(scratch, "node_modules/.bin/codex");
  const env = {
    PATH: `${join(scratch, "node_modules/.bin")}:${process.env.PATH}`,
    CODEX_HOME: codexHome
  };
  const run = async (...args) =>
    (await exec(codex, args, { cwd: project, env, timeout: 60000, maxBuffer: 1024 * 1024 })).stdout;
  console.log((await run("--version")).trim());
  await run("plugin", "marketplace", "add", useGitHub ? "debugbundle/debugbundle" : marketplace);
  await run("plugin", "add", "debugbundle-codex@debugbundle");
  const listing = await run("plugin", "list", "--marketplace", "debugbundle", "--json");
  assert.ok(listing.includes("debugbundle-codex"));

  async function connect(expectSkill) {
    rpc = appServer(codex, env);
    await rpc.call("initialize", {
      clientInfo: { name: "debugbundle_smoke", version: "1.0.0" },
      capabilities: { experimentalApi: true }
    });
    rpc.notify("initialized");
    if (expectSkill) {
      const skills = await rpc.call("skills/list", { cwds: [project], forceReload: true });
      assert.ok(
        JSON.stringify(skills).includes("debugbundle-codex"),
        "installed skill is discoverable"
      );
    }
    const started = await rpc.call("thread/start", {
      cwd: project,
      ephemeral: true,
      approvalPolicy: "never"
    });
    const threadId = started.thread.id;
    const inventory = await rpc.call("mcpServerStatus/list", { threadId });
    const server = inventory.data.find((entry) => entry.name.includes("debugbundle"));
    assert.ok(server, `missing server: ${JSON.stringify(inventory)}`);
    const catalog = Object.values(server.tools);
    for (const tool of catalog) assert.ok(!("bearerToken" in tool.inputSchema.properties));
    for (const name of [
      "doctor",
      "list_incidents",
      "get_bundle",
      "get_reproduction",
      "list_projects",
      "resolve_incident"
    ]) {
      assert.ok(
        catalog.some((tool) => tool.name === name),
        `missing tool: ${name}`
      );
    }
    console.log(
      `Discovered ${catalog.length} tools through ${expectSkill ? "plugin" : "direct MCP"}`
    );
    return async (tool, args) => {
      const result = await rpc.call("mcpServer/tool/call", {
        threadId,
        server: server.name,
        tool,
        arguments: args
      });
      assert.ok(!result.isError, `${tool}:${JSON.stringify(result)}`);
      return JSON.parse(result.content.find((item) => item.type === "text").text);
    };
  }

  let call = await connect(true);
  const local = await call("list_incidents", { source: "local" });
  assert.ok(
    JSON.stringify(local).includes(fixture.openIncident.incidentId),
    "local retrieval must use the active repository without credentials"
  );
  assert.ok(
    JSON.stringify(
      await call("get_bundle", { source: "local", incidentId: fixture.openIncident.incidentId })
    ).includes(fixture.openIncident.incidentId)
  );
  assert.ok(
    JSON.stringify(
      await call("get_reproduction", {
        source: "local",
        incidentId: fixture.openIncident.incidentId
      })
    ).includes("request_context_available")
  );
  await rpc.close();
  rpc = undefined;

  // The synthetic auth file is in the disposable container's home, never a host mount.
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const authPath = join(homedir(), ".debugbundle/auth.json");
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify({ bearer_token: syntheticToken, base_url: apiUrl }), {
    mode: 0o600
  });
  call = await connect(true);
  assert.deepEqual(await call("list_projects", {}), { projects: [] });
  assert.equal(requests, 1, "CLI auth must reach only the synthetic API");
  await rpc.close();
  rpc = undefined;
  // Local-path sources are read directly; marketplace upgrade is Git-only.
  if (useGitHub) await run("plugin", "marketplace", "upgrade", "debugbundle");
  await run("plugin", "add", "debugbundle-codex@debugbundle");
  await run("plugin", "remove", "debugbundle-codex@debugbundle");
  await run("mcp", "add", "debugbundle", "--", "npx", "-y", mcpSpec, "--local-auth");
  await rm(authPath);
  const configPath = join(codexHome, "config.toml");
  const config = await readFile(configPath, "utf8");
  assert.ok(config.includes("[mcp_servers.debugbundle]"));
  await writeFile(
    configPath,
    config.replace(
      "[mcp_servers.debugbundle]",
      '[mcp_servers.debugbundle]\nenv_vars = ["DEBUGBUNDLE_MEMBER_TOKEN", "DEBUGBUNDLE_API_URL"]'
    )
  );
  env.DEBUGBUNDLE_MEMBER_TOKEN = syntheticToken;
  env.DEBUGBUNDLE_API_URL = apiUrl;
  call = await connect(false);
  assert.deepEqual(await call("list_projects", {}), { projects: [] });
  assert.equal(requests, 2);
  await rpc.close();
  rpc = undefined;
  await run("mcp", "remove", "debugbundle");
  await run("plugin", "marketplace", "remove", "debugbundle");
  console.log(
    `PASS: install, skill/tool discovery, local retrieval, CLI auth, direct MCP auth, ${useGitHub ? "GitHub upgrade/reinstall" : "local-source reinstall"}, removal. No model turn or customer API call.`
  );
} finally {
  if (rpc) await rpc.close();
  api.close();
  await rm(scratch, { recursive: true, force: true });
}
