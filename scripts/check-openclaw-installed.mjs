import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run only in a disposable container. No existing OpenClaw profile, credentials,
// model provider or production project participates in this installed proof.
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(join(sourceRoot, "apps/openclaw-plugin/package.json"), "utf8")
);
const hostVersion = process.env.OPENCLAW_CHECK_HOST_VERSION ?? packageJson.devDependencies.openclaw;
const root = mkdtempSync(join(tmpdir(), "debugbundle-openclaw-installed-"));
const host = join(root, "host");
const state = join(root, "state");
const configPath = join(state, "openclaw.json");
const outputDirectory = process.env.OPENCLAW_CHECK_OUTPUT;
const installSpec =
  process.env.OPENCLAW_CHECK_SPEC ??
  join(
    sourceRoot,
    ".tmp/openclaw-installed-package",
    `debugbundle-openclaw-plugin-${packageJson.version}.tgz`
  );
const env = { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configPath };

function run(name, command, args) {
  const output = execFileSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (outputDirectory !== undefined) {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, `${name}.log`), output, { mode: 0o600 });
  }
  return output;
}

try {
  mkdirSync(state);
  console.log(`Installing clean OpenClaw ${hostVersion} host.`);
  run("host-install", "npm", [
    "install",
    "--prefix",
    host,
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    `openclaw@${hostVersion}`
  ]);
  const bin = join(host, "node_modules/openclaw/openclaw.mjs");
  console.log(`Installing DebugBundle ${packageJson.version} through the normal plugin installer.`);
  const installArgs = [bin, "plugins", "install", installSpec];
  if (process.env.OPENCLAW_CHECK_TRUST_LOCAL === "1") {
    // New hosts require explicit trust for an unreviewed local archive. Only our
    // exact built candidate may use this acknowledgement; remote installs must
    // retain normal ClawHub security enforcement without a force flag.
    assert.equal(
      resolve(installSpec),
      join(
        sourceRoot,
        ".tmp/openclaw-installed-package",
        `debugbundle-openclaw-plugin-${packageJson.version}.tgz`
      )
    );
    installArgs.push("--force");
  }
  if (process.env.OPENCLAW_CHECK_ACCEPT_CAPABILITIES === "1") {
    // The release fixture reviews our fixed catalog and hook before accepting
    // the host's normal one-time capability consent. Install policy still runs.
    installArgs.push("--accept-capabilities");
  }
  run("plugin-install", process.execPath, installArgs);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.plugins ??= {};
  config.plugins.allow = ["debugbundle"];
  config.plugins.entries ??= {};
  config.plugins.entries.debugbundle = { ...config.plugins.entries.debugbundle, enabled: true };
  writeFileSync(configPath, JSON.stringify(config));
  const raw = run("runtime-inspection", process.execPath, [
    bin,
    "plugins",
    "inspect",
    "debugbundle",
    "--runtime",
    "--json"
  ]);
  const report = JSON.parse(raw.slice(raw.indexOf("{")));
  assert.equal(report.plugin.id, "debugbundle");
  assert.equal(report.plugin.status, "loaded", JSON.stringify(report));
  assert.equal(report.plugin.version, packageJson.version);
  const manifest = JSON.parse(
    readFileSync(join(sourceRoot, "apps/openclaw-plugin/openclaw.plugin.json"), "utf8")
  );
  assert.deepEqual([...report.plugin.toolNames].sort(), [...manifest.contracts.tools].sort());
  assert.ok(!raw.includes('Dynamic require of "node:assert"'));
  const installedEntry = report.plugin.source;
  assert.equal(typeof installedEntry, "string");
  assert.ok(resolve(installedEntry).startsWith(`${state}/`));
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(
    digest(installedEntry),
    digest(join(sourceRoot, "apps/openclaw-plugin/dist/index.js"))
  );
  run("installed-native-read", process.execPath, [
    join(sourceRoot, "apps/openclaw-plugin/scripts/check-runtime.mjs"),
    installedEntry
  ]);
  console.log(
    `Installed OpenClaw ${hostVersion} loads DebugBundle ${packageJson.version}; installed native scoped requests pass.`
  );
} catch (error) {
  process.stderr.write(error.stderr?.toString() ?? "");
  throw error;
} finally {
  rmSync(root, { recursive: true, force: true });
}
