#!/usr/bin/env node

// Native install/discovery and exact MCP command run in a disposable Docker home.
// Recorded responses drive real Gemini tool calls; no model API, host credential,
// or customer API request is used.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLocalRetrievalFixture } from "../tests/helpers/local-retrieval-fixture.ts";
import { callGeminiTools } from "./gemini-smoke-session.mjs";

assert.ok(existsSync("/.dockerenv"), "Use make gemini-extension-smoke for an isolated home");
const exec = promisify(execFile);
const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(source, "plugins/debugbundle-gemini/gemini-extension.json"), "utf8")
);
const server = manifest.mcpServers.debugbundle;
const scratch = await mkdtemp(join(tmpdir(), "debugbundle-gemini-"));
const home = join(scratch, "home");
const project = join(scratch, "application");
const extension = join(scratch, "debugbundle-gemini");
const clientVersion = process.env.GEMINI_SMOKE_VERSION ?? "0.61.0";
const token = "gemini-smoke-synthetic-member";
let requests = 0;
let denyAccess = false;
const api = createServer((request, response) => {
  requests++;
  assert.equal(request.method, "GET");
  assert.equal(request.url, "/v1/projects");
  assert.equal(request.headers.authorization, `Bearer ${token}`);
  response.setHeader("content-type", "application/json");
  if (denyAccess) {
    response.statusCode = 403;
    response.end(JSON.stringify({ error: "forbidden" }));
    return;
  }
  response.end(JSON.stringify({ projects: [] }));
});

try {
  await mkdir(home);
  const fixture = await createLocalRetrievalFixture();
  await cp(fixture.rootDirectory, project, { recursive: true });
  await rm(fixture.rootDirectory, { recursive: true });
  const packageSource = join(scratch, "plugins/debugbundle-gemini");
  await cp(join(source, "plugins/debugbundle-gemini"), packageSource, { recursive: true });
  const packageScript = join(source, "scripts/package-gemini-extension.mjs");
  await exec(process.execPath, [packageScript], { cwd: scratch });
  const archive = join(scratch, `.tmp/gemini-extension/debugbundle-gemini-${manifest.version}.zip`);
  const firstArchive = await readFile(archive);
  await exec(process.execPath, [packageScript], { cwd: scratch });
  assert.deepEqual(await readFile(archive), firstArchive, "release archive must be reproducible");
  await exec("unzip", ["-q", archive, "-d", extension]);
  await writeFile(
    join(project, "package.json"),
    '{"name":"gemini-smoke-application","private":true}\n'
  );
  await exec(
    "npm",
    [
      "install",
      "--prefix",
      project,
      "--no-package-lock",
      "--ignore-scripts",
      `@google/gemini-cli@${clientVersion}`,
      "@debugbundle/cli@1.12.0",
      server.args[1]
    ],
    { cwd: scratch, timeout: 180000, maxBuffer: 1024 * 1024 }
  );
  const gemini = join(project, "node_modules/.bin/gemini");
  const env = {
    HOME: home,
    PATH: `${join(project, "node_modules/.bin")}:${process.env.PATH}`,
    CI: "true",
    GEMINI_CLI_TRUST_WORKSPACE: "true",
    GEMINI_CLI_NO_RELAUNCH: "true",
    GEMINI_API_KEY: "synthetic-unused-key",
    // Dependencies are installed; block npm downloads and proxied external traffic.
    npm_config_offline: "true",
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "127.0.0.1,localhost"
  };
  const settingsPath = join(home, ".gemini/settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(
    settingsPath,
    JSON.stringify({
      security: { auth: { selectedType: "gemini-api-key" } },
      telemetry: { enabled: false }
    })
  );
  const originalSettings = await readFile(settingsPath, "utf8");
  const execute = (input, ...args) =>
    new Promise((resolve, reject) => {
      const child = spawn(gemini, args, {
        cwd: project,
        env,
        detached: true,
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
      const timeout = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        reject(new Error(`Gemini command timed out: ${args.join(" ")}\n${stdout}\n${stderr}`));
      }, 45000);
      child.stdin.end(input);
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(`${stdout}\n${stderr}`);
        else
          reject(
            new Error(`Gemini command failed (${code}): ${args.join(" ")}\n${stdout}\n${stderr}`)
          );
      });
    });
  const run = (...args) => execute("", ...args);
  console.log((await run("--version")).trim());
  const install = await run("extensions", "install", extension, "--consent");
  const installed = await run("extensions", "list");
  assert.ok(installed.includes(manifest.name), `install: ${install}\nlist: ${installed}`);
  assert.ok((await run("skills", "list")).includes("debugbundle"));
  const status = await run("mcp", "list");
  assert.ok(status.includes("debugbundle") && status.includes("Connected"), status);
  const localCalls = [
    { name: "mcp_debugbundle_list_incidents", args: { source: "local" } },
    {
      name: "mcp_debugbundle_get_bundle",
      args: { source: "local", incidentId: fixture.openIncident.incidentId }
    },
    {
      name: "mcp_debugbundle_get_reproduction",
      args: { source: "local", incidentId: fixture.openIncident.incidentId }
    }
  ];
  const verifyLocal = async () => {
    const results = await callGeminiTools(run, scratch, localCalls);
    for (const result of results) assert.equal(result.status, "success", JSON.stringify(result));
    assert.ok(results[0].output.includes(fixture.openIncident.incidentId));
    assert.ok(results[1].output.includes(fixture.openIncident.incidentId));
    assert.ok(results[2].output.includes("request_context_available"));
  };
  await verifyLocal();
  assert.equal(requests, 0, "local evidence needs no hosted authentication");
  const setup = await exec(
    join(project, "node_modules/.bin/debugbundle"),
    ["setup", "--agent", "gemini-cli", "--non-interactive", "--json"],
    { cwd: project, env, timeout: 30000 }
  );
  assert.ok(
    JSON.parse(setup.stdout).agent_setup.agents.some(
      (agent) => agent.agent === "gemini-cli" && agent.discovery === "ok"
    )
  );
  const projectSkill = join(project, ".agents/skills/debugbundle/SKILL.md");
  assert.ok(
    (await readFile(join(project, "GEMINI.md"), "utf8")).includes(
      ".agents/skills/debugbundle/SKILL.md"
    )
  );
  const preferredSkill = await run("skills", "list");
  assert.ok(preferredSkill.includes(projectSkill), preferredSkill);
  const [activated] = await callGeminiTools(run, scratch, [
    { name: "activate_skill", args: { name: "debugbundle" } }
  ]);
  assert.equal(activated.status, "success", JSON.stringify(activated));
  assert.ok(activated.output.includes(project), "Gemini must activate the generated project skill");
  const versionParts = manifest.version.split(".").map(Number);
  const nextVersion = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;
  const nextManifest = { ...manifest, version: nextVersion };
  await writeFile(join(extension, "gemini-extension.json"), JSON.stringify(nextManifest));
  const updateOutput = await execute("y\n", "extensions", "update", manifest.name);
  const updated = await run("extensions", "list");
  assert.ok(updated.includes(manifest.name) && updated.includes(nextVersion), updated);
  const updatedStatus = await run("mcp", "list");
  assert.ok(updatedStatus.includes("Connected"), `${updateOutput}\n${updated}\n${updatedStatus}`);
  console.log(
    "Archive install, local bundle/reproduction retrieval, project setup/skill activation, and update passed"
  );

  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const authPath = join(home, ".debugbundle/auth.json");
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify({ bearer_token: token, base_url: apiUrl }), {
    mode: 0o600
  });
  const hostedCall = { name: "mcp_debugbundle_list_projects", args: {} };
  const [hosted, rejected] = await callGeminiTools(run, scratch, [
    hostedCall,
    { ...hostedCall, args: { bearerToken: "synthetic-injected" } }
  ]);
  assert.equal(hosted.status, "success", JSON.stringify(hosted));
  assert.deepEqual(JSON.parse(hosted.output), { projects: [] });
  assert.equal(rejected.status, "error", JSON.stringify(rejected));
  assert.equal(requests, 1, "Gemini must use saved login only for the legitimate call");

  async function exchange(messages) {
    const child = spawn(server.command, server.args, {
      cwd: project,
      env,
      detached: true,
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
    const stop = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    const timeout = setTimeout(stop, 60000);
    try {
      child.stdin.end(
        messages
          .map((message, index) => JSON.stringify({ jsonrpc: "2.0", id: index + 1, ...message }))
          .join("\n") + "\n"
      );
      const [code] = await once(child, "close");
      assert.equal(code, 0, stderr);
      return stdout
        .trim()
        .split(/\r?\n/u)
        .map((line) => JSON.parse(line))
        .sort((a, b) => a.id - b.id);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) stop();
    }
  }
  const listProjects = { method: "tools/call", params: { name: "list_projects", arguments: {} } };
  const [catalog, saved, injected] = await exchange([
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
  assert.ok(injected.error || injected.result?.isError);
  assert.equal(requests, 2);
  await rm(authPath);
  const [missing] = await callGeminiTools(run, scratch, [hostedCall]);
  assert.equal(missing.status, "error", JSON.stringify(missing));
  assert.ok(JSON.stringify(missing).includes("mcp_tool_error:auth_state_missing"));
  assert.equal(requests, 2);
  console.log(`${catalog.result.tools.length} tools; saved login and credential boundaries passed`);

  await run("extensions", "uninstall", manifest.name);
  assert.ok(!(await run("extensions", "list")).includes(manifest.name));
  assert.equal(
    await readFile(settingsPath, "utf8"),
    originalSettings,
    "extension lifecycle must preserve user settings"
  );
  await run(
    "mcp",
    "add",
    "--scope",
    "user",
    "debugbundle",
    "npx",
    "-y",
    server.args[1],
    "--local-auth"
  );
  const direct = await run("mcp", "list");
  assert.ok(
    direct.includes("debugbundle") &&
      direct.includes("--local-auth") &&
      direct.includes("Connected"),
    direct
  );
  await verifyLocal();
  const directSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  directSettings.mcpServers.debugbundle.env = {
    DEBUGBUNDLE_MEMBER_TOKEN: "${DEBUGBUNDLE_MEMBER_TOKEN}",
    DEBUGBUNDLE_API_URL: "${DEBUGBUNDLE_API_URL}"
  };
  await writeFile(settingsPath, JSON.stringify(directSettings));
  env.DEBUGBUNDLE_MEMBER_TOKEN = token;
  env.DEBUGBUNDLE_API_URL = apiUrl;
  const [forwarded] = await callGeminiTools(run, scratch, [hostedCall]);
  assert.equal(forwarded.status, "success", JSON.stringify(forwarded));
  assert.deepEqual(JSON.parse(forwarded.output), { projects: [] });
  assert.equal(requests, 3, "direct settings must forward the protected environment");
  denyAccess = true;
  const [denied] = await callGeminiTools(run, scratch, [hostedCall]);
  assert.equal(denied.status, "error", JSON.stringify(denied));
  assert.ok(JSON.stringify(denied).includes("mcp_tool_error:forbidden"), JSON.stringify(denied));
  assert.equal(requests, 4, "denied access must not trigger a retry or alternate credential path");
  await run("mcp", "remove", "--scope", "user", "debugbundle");
  assert.ok(!(await run("mcp", "list")).includes("debugbundle"));
  const remainingSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(!remainingSettings.mcpServers?.debugbundle);
  delete remainingSettings.mcpServers;
  assert.deepEqual(remainingSettings, JSON.parse(originalSettings));
  assert.ok(existsSync(projectSkill), "removal must preserve application guidance");
  console.log(
    "Direct local retrieval, protected environment auth, access denial, removal, and settings preservation passed"
  );
} finally {
  api.close();
  await rm(scratch, { recursive: true, force: true });
}
