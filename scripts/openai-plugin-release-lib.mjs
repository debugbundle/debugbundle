import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptDirectory, "..");
export const openAiRoot = join(repoRoot, "apps", "mcp", "openai");
export const pluginRoot = join(openAiRoot, "debugbundle");
export const submissionRoot = join(openAiRoot, "submission");
export const contractFixturePath = join(
  repoRoot,
  "tests",
  "fixtures",
  "openai-plugin-v1",
  "tool-contracts.json"
);
export const schemaFixturePath = join(
  repoRoot,
  "tests",
  "fixtures",
  "openai-plugin-v1",
  "schemas.json"
);
export const reviewerFixturePath = join(
  repoRoot,
  "tests",
  "fixtures",
  "openai-plugin-v1",
  "reviewer-tenant.json"
);
export const dataMapPath = join(repoRoot, "contracts", "openai-plugin-v1-data-map.md");
export const releaseManifestPath = join(openAiRoot, "release-manifest.json");

const expectedVersion = "1.0.0";
const expectedResource = "https://mcp.debugbundle.com";
const expectedEndpoint = `${expectedResource}/mcp`;
const expectedIssuer = "https://api.debugbundle.com";
const expectedPrompts = [
  "Investigate my latest production incident.",
  "Explain this incident from its bundle and reproduction.",
  "Summarize product usage and checkout funnel performance for the last 7 days.",
  "Why is this endpoint health check failing?"
];
const requiredPackageFiles = [
  ".codex-plugin/plugin.json",
  "LICENSE",
  "README.md",
  "assets/icon-512.png",
  "skills/debugbundle/SKILL.md",
  "skills/debugbundle/references/privacy-and-safety.md",
  "skills/debugbundle/references/tools.md"
];
const requiredSubmissionFiles = [
  "data-map.md",
  "listing.md",
  "policy-review.md",
  "release-notes.md",
  "review-checklist.md",
  "starter-prompts.json",
  "test-cases.json"
];
const allowedManifestFields = new Set([
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "skills",
  "apps",
  "interface"
]);
const allowedInterfaceFields = new Set([
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
  "capabilities",
  "websiteURL",
  "privacyPolicyURL",
  "termsOfServiceURL",
  "defaultPrompt",
  "brandColor",
  "composerIcon",
  "logo"
]);
const requiredCaseFields = [
  "id",
  "kind",
  "prompt",
  "setup_state",
  "auth",
  "fixture_ids",
  "expected_sequence",
  "expected_arguments",
  "expected_result_schemas",
  "forbidden_tools",
  "forbidden_fields",
  "answer_properties",
  "cleanup"
];
const forbiddenSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /"client_secret"\s*:\s*"[^"\s]{12,}"/u,
  /"credential"\s*:\s*"[^"\s]{16,}"/u
];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

export function walkRegularFiles(root) {
  const resolvedRoot = realpathSync(root);
  const files = [];

  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const entry = lstatSync(path);

      if (entry.isSymbolicLink()) {
        throw new Error(`symlink_forbidden:${normalizedRelativePath(root, path)}`);
      }

      if (entry.isDirectory()) {
        visit(path);
        continue;
      }

      if (!entry.isFile()) {
        throw new Error(`non_regular_file_forbidden:${normalizedRelativePath(root, path)}`);
      }

      const realPath = realpathSync(path);
      if (realPath !== resolvedRoot && !realPath.startsWith(`${resolvedRoot}${sep}`)) {
        throw new Error(`path_escape:${normalizedRelativePath(root, path)}`);
      }

      files.push({
        path,
        relativePath: normalizedRelativePath(root, path),
        bytes: readFileSync(path)
      });
    }
  }

  visit(root);
  return files;
}

function requireExactKeys(value, allowed, label, failures) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label}:must_be_object`);
    return;
  }

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failures.push(`${label}:unknown_field:${key}`);
    }
  }
}

function requireHttpsUrl(value, label, failures) {
  if (typeof value !== "string") {
    failures.push(`${label}:missing`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      failures.push(`${label}:must_be_clean_https_url`);
    }
  } catch {
    failures.push(`${label}:invalid_url`);
  }
}

function requireRelativePath(value, label, failures) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("..") ||
    value.includes("\\")
  ) {
    failures.push(`${label}:invalid_relative_path`);
    return;
  }

  const resolved = resolve(pluginRoot, value);
  if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}${sep}`)) {
    failures.push(`${label}:path_escape`);
  } else if (!existsSync(resolved)) {
    failures.push(`${label}:missing_target`);
  }
}

function validatePng(path, label, failures) {
  if (!existsSync(path)) {
    failures.push(`${label}:missing`);
    return;
  }

  const bytes = readFileSync(path);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
    failures.push(`${label}:invalid_png`);
  }
}

function validateManifest(failures) {
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  let manifest;

  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    failures.push(`plugin_manifest:invalid_json:${error.message}`);
    return undefined;
  }

  requireExactKeys(manifest, allowedManifestFields, "plugin_manifest", failures);
  requireExactKeys(
    manifest.interface,
    allowedInterfaceFields,
    "plugin_manifest.interface",
    failures
  );

  if (manifest.name !== "debugbundle") failures.push("plugin_manifest:name_mismatch");
  if (manifest.version !== expectedVersion) failures.push("plugin_manifest:version_mismatch");
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(manifest.version ?? "")) {
    failures.push("plugin_manifest:public_version_not_strict_semver");
  }
  if (
    manifest.description !==
    "Investigate production incidents and aggregate product analytics with read-only DebugBundle evidence."
  ) {
    failures.push("plugin_manifest:description_drift");
  }
  if (
    manifest.author?.name !== "DebugBundle" ||
    manifest.author?.email !== "support@debugbundle.com"
  ) {
    failures.push("plugin_manifest:publisher_drift");
  }
  if (manifest.license !== "MIT-0") failures.push("plugin_manifest:license_drift");
  if (manifest.skills !== "./skills/") failures.push("plugin_manifest:skills_path_drift");
  if (manifest.mcpServers !== undefined) failures.push("plugin_manifest:mcp_server_forbidden");
  if (manifest.hooks !== undefined) failures.push("plugin_manifest:hooks_forbidden");
  if (manifest.interface?.category !== "Developer Tools")
    failures.push("plugin_manifest:category_drift");
  if (stableJson(manifest.interface?.capabilities) !== stableJson(["Read"])) {
    failures.push("plugin_manifest:capabilities_drift");
  }
  if (stableJson(manifest.interface?.defaultPrompt) !== stableJson(expectedPrompts)) {
    failures.push("plugin_manifest:starter_prompt_drift");
  }
  for (const prompt of manifest.interface?.defaultPrompt ?? []) {
    if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 128) {
      failures.push("plugin_manifest:invalid_starter_prompt");
    }
  }

  requireHttpsUrl(manifest.homepage, "plugin_manifest.homepage", failures);
  requireHttpsUrl(manifest.author?.url, "plugin_manifest.author.url", failures);
  requireHttpsUrl(manifest.interface?.websiteURL, "plugin_manifest.interface.websiteURL", failures);
  requireHttpsUrl(
    manifest.interface?.privacyPolicyURL,
    "plugin_manifest.interface.privacyPolicyURL",
    failures
  );
  requireHttpsUrl(
    manifest.interface?.termsOfServiceURL,
    "plugin_manifest.interface.termsOfServiceURL",
    failures
  );
  requireRelativePath(manifest.skills, "plugin_manifest.skills", failures);
  requireRelativePath(
    manifest.interface?.composerIcon,
    "plugin_manifest.interface.composerIcon",
    failures
  );
  requireRelativePath(manifest.interface?.logo, "plugin_manifest.interface.logo", failures);

  return manifest;
}

function validateConnection(manifest, requireConnection, failures, manualGates) {
  const appPath = join(pluginRoot, ".app.json");
  const hasApp = existsSync(appPath);

  if (!hasApp) {
    if (manifest?.apps !== undefined) failures.push("plugin_manifest:apps_without_app_json");
    manualGates.push("developer_mode_connection_registration_and_app_json");
    if (requireConnection) failures.push("connection:app_json_required");
    return undefined;
  }

  if (manifest?.apps !== "./.app.json") failures.push("plugin_manifest:app_path_drift");

  let app;
  try {
    app = readJson(appPath);
  } catch (error) {
    failures.push(`connection:invalid_json:${error.message}`);
    return undefined;
  }

  const id = app?.apps?.debugbundle?.id;
  if (
    Object.keys(app ?? {}).join(",") !== "apps" ||
    Object.keys(app?.apps ?? {}).join(",") !== "debugbundle" ||
    Object.keys(app?.apps?.debugbundle ?? {}).join(",") !== "id"
  ) {
    failures.push("connection:unexpected_shape");
  }
  if (typeof id !== "string" || !/^(?:plugin_asdk_app|connector)_[A-Za-z0-9]+$/u.test(id)) {
    failures.push("connection:invalid_registered_id");
  }
  return id;
}

function validateCorpus(contract, failures) {
  const prompts = readJson(join(submissionRoot, "starter-prompts.json"));
  if (
    prompts.version !== expectedVersion ||
    stableJson(prompts.prompts) !== stableJson(expectedPrompts)
  ) {
    failures.push("submission:starter_prompt_drift");
  }

  const corpus = readJson(join(submissionRoot, "test-cases.json"));
  const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
  const ids = new Set();
  const positiveCount = cases.filter((entry) => entry.kind === "positive").length;
  const negativeCount = cases.filter((entry) => entry.kind === "negative").length;

  if (corpus.version !== expectedVersion) failures.push("submission:test_version_drift");
  if (positiveCount < 9) failures.push(`submission:positive_cases_too_few:${positiveCount}`);
  if (negativeCount < 6) failures.push(`submission:negative_cases_too_few:${negativeCount}`);

  for (const entry of cases) {
    for (const field of requiredCaseFields) {
      if (!(field in entry))
        failures.push(`submission:test_case_missing_field:${entry.id ?? "unknown"}:${field}`);
    }
    if (ids.has(entry.id)) failures.push(`submission:duplicate_test_id:${entry.id}`);
    ids.add(entry.id);
    if ((entry.expected_sequence?.length ?? 0) !== (entry.expected_arguments?.length ?? 0)) {
      failures.push(`submission:test_sequence_argument_mismatch:${entry.id}`);
    }
    for (const tool of entry.expected_sequence ?? []) {
      if (tool.startsWith("oauth_") || tool.startsWith("manual_")) continue;
      if (!contract.tools.some((candidate) => candidate.name === tool)) {
        failures.push(`submission:unknown_expected_tool:${entry.id}:${tool}`);
      }
    }
  }
}

function validateSkill(contract, failures) {
  const files = walkRegularFiles(join(pluginRoot, "skills", "debugbundle"));
  const text = files.map((entry) => entry.bytes.toString("utf8")).join("\n");

  for (const tool of contract.tools) {
    if (!text.includes(`\`${tool.name}\``)) failures.push(`skill:missing_tool:${tool.name}`);
  }
  for (const phrase of [
    "read-only",
    "untrusted data",
    "raw logs",
    "generic infrastructure",
    "local source",
    "never returns raw logs",
    "never regenerates or queues"
  ]) {
    if (!text.toLowerCase().includes(phrase))
      failures.push(`skill:missing_safety_invariant:${phrase}`);
  }
  for (const forbidden of [
    "DEBUGBUNDLE_MEMBER_TOKEN",
    "bearerToken",
    "@debugbundle/mcp",
    "activate_probe",
    "get_analytics_journey_sample",
    "generate_analytics_bundle",
    "update_analytics_settings",
    "create_saved_funnel",
    "resolve_incident"
  ]) {
    if (text.includes(forbidden)) failures.push(`skill:forbidden_legacy_surface:${forbidden}`);
  }
}

function validateFiles(failures) {
  for (const path of requiredPackageFiles) {
    if (!existsSync(join(pluginRoot, path))) failures.push(`package:missing_file:${path}`);
  }
  for (const path of requiredSubmissionFiles) {
    if (!existsSync(join(submissionRoot, path))) failures.push(`submission:missing_file:${path}`);
  }
  if (existsSync(join(pluginRoot, ".mcp.json"))) failures.push("package:mcp_json_forbidden");

  const sourceIcon = join(repoRoot, "site", "public", "icon-512.png");
  const packageIcon = join(pluginRoot, "assets", "icon-512.png");
  validatePng(packageIcon, "package:icon", failures);
  if (
    existsSync(sourceIcon) &&
    existsSync(packageIcon) &&
    sha256File(sourceIcon) !== sha256File(packageIcon)
  ) {
    failures.push("package:icon_source_drift");
  }

  for (const root of [pluginRoot, submissionRoot]) {
    for (const entry of walkRegularFiles(root)) {
      if (entry.relativePath.endsWith(".png")) continue;
      const text = entry.bytes.toString("utf8");
      if (/\[(?:TODO|FIXME):/iu.test(text) || /\b(?:CHANGEME|YOUR_[A-Z0-9_]+)\b/u.test(text)) {
        failures.push(`package:placeholder:${normalizedRelativePath(repoRoot, entry.path)}`);
      }
      for (const pattern of forbiddenSecretPatterns) {
        if (pattern.test(text))
          failures.push(`package:secret_pattern:${normalizedRelativePath(repoRoot, entry.path)}`);
      }
    }
  }
}

export function validateOpenAiPluginSource({ requireConnection = false } = {}) {
  const failures = [];
  const manualGates = [];
  validateFiles(failures);
  const manifest = validateManifest(failures);
  const connectionId = validateConnection(manifest, requireConnection, failures, manualGates);

  const contract = readJson(contractFixturePath);
  if (
    contract.contract_version !== expectedVersion ||
    contract.product_shape !== "skill_plus_remote_mcp" ||
    contract.resource !== expectedResource ||
    contract.endpoint !== expectedEndpoint ||
    contract.issuer !== expectedIssuer ||
    contract.tools.length !== 23
  ) {
    failures.push("contract:product_shape_drift");
  }
  validateSkill(contract, failures);
  validateCorpus(contract, failures);

  return {
    ok: failures.length === 0,
    evidenceState: connectionId === undefined ? "local_source_ready" : "local_connection_ready",
    version: manifest?.version,
    connectionId,
    manualGates,
    failures
  };
}

export function collectHashInventory(root) {
  return Object.fromEntries(
    walkRegularFiles(root).map((entry) => [entry.relativePath, sha256Bytes(entry.bytes)])
  );
}

export function collectReleaseInputs() {
  return {
    plugin: collectHashInventory(pluginRoot),
    submission: collectHashInventory(submissionRoot),
    contracts: {
      "tests/fixtures/openai-plugin-v1/tool-contracts.json": sha256File(contractFixturePath),
      "tests/fixtures/openai-plugin-v1/schemas.json": sha256File(schemaFixturePath),
      "tests/fixtures/openai-plugin-v1/reviewer-tenant.json": sha256File(reviewerFixturePath),
      "contracts/openai-plugin-v1-data-map.md": sha256File(dataMapPath)
    }
  };
}

export const openAiPluginConstants = Object.freeze({
  version: expectedVersion,
  resource: expectedResource,
  endpoint: expectedEndpoint,
  issuer: expectedIssuer,
  prompts: expectedPrompts
});
