#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

import { buildDeterministicZip } from "./deterministic-zip.mjs";
import { readOpenAiPluginSourceState } from "./openai-plugin-source-state.mjs";
import {
  collectReleaseInputs,
  contractFixturePath,
  dataMapPath,
  openAiPluginConstants,
  pluginRoot,
  readJson,
  releaseManifestPath,
  repoRoot,
  reviewerFixturePath,
  schemaFixturePath,
  sha256Bytes,
  stableJson,
  submissionRoot,
  validateOpenAiPluginSource,
  walkRegularFiles
} from "./openai-plugin-release-lib.mjs";

const defaultOutputRoot = join(repoRoot, "dist", "openai-plugin", openAiPluginConstants.version);

function parseArgs(argv) {
  const parsed = {
    command: "plan",
    json: false,
    requireConnection: false,
    apiImageDigest: undefined,
    outputRoot: defaultOutputRoot
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") parsed.json = true;
    else if (token === "--require-connection") parsed.requireConnection = true;
    else if (token === "--api-image-digest") {
      parsed.apiImageDigest = argv[index + 1];
      index += 1;
    } else if (token === "--output") {
      parsed.outputRoot = argv[index + 1];
      index += 1;
    } else if (token === "--help" || token === "-h") parsed.command = "help";
    else if (token.startsWith("--")) throw new Error(`unknown_option:${token}`);
    else positionals.push(token);
  }

  if (positionals.length > 0) parsed.command = positionals[0];
  if (!["plan", "validate", "prepare", "verify", "help"].includes(parsed.command)) {
    throw new Error(`unsupported_command:${parsed.command}`);
  }
  if (
    parsed.apiImageDigest !== undefined &&
    !/^sha256:[0-9a-f]{64}$/u.test(parsed.apiImageDigest)
  ) {
    throw new Error("invalid_api_image_digest");
  }
  return parsed;
}

function pluginArchiveEntries() {
  return walkRegularFiles(pluginRoot).map((entry) => ({
    path: `debugbundle/${entry.relativePath}`,
    bytes: entry.bytes
  }));
}

function packetArchiveEntries(manifestBytes) {
  const entries = walkRegularFiles(submissionRoot).map((entry) => ({
    path: `submission/${entry.relativePath}`,
    bytes: entry.bytes
  }));
  for (const path of [contractFixturePath, schemaFixturePath, reviewerFixturePath, dataMapPath]) {
    entries.push({
      path: relative(repoRoot, path).split("/").join("/"),
      bytes: readFileSync(path)
    });
  }
  entries.push({ path: "release-manifest.json", bytes: manifestBytes });
  return entries;
}

function manualGates(validation, apiImageDigest) {
  const gates = [
    "manual_keyboard_and_screen_reader_accessibility_validation",
    "representative_capacity_load_evidence",
    "reviewer_outside_network_smoke_and_fixture_isolation",
    "remaining_chatgpt_and_codex_reviewer_corpus",
    "openai_monitoring_install_and_recurring_spend_approval",
    "remaining_owner_legal_attestations",
    "owner_submission_approval",
    "openai_review_and_approval",
    "separate_owner_publication_approval",
    "directory_discovery_verification",
    "separate_communication_approval"
  ];
  if (validation.connectionId === undefined) {
    gates.unshift("developer_mode_connection_registration_scan_and_app_json");
  }
  if (apiImageDigest === undefined) gates.unshift("immutable_api_image_deployment_digest");
  return gates;
}

function buildManifest(validation, pluginArchive, apiImageDigest, recordedCommit) {
  const contract = readJson(contractFixturePath);
  const inputs = collectReleaseInputs();
  const state = readOpenAiPluginSourceState({
    repoRoot,
    releaseManifestRelativePath: relative(repoRoot, releaseManifestPath).split("\\").join("/"),
    recordedCommit
  });

  return {
    schema_version: "1.0.0",
    plugin_version: openAiPluginConstants.version,
    evidence_state: validation.evidenceState,
    source: state,
    runtime: {
      resource_origin: openAiPluginConstants.resource,
      mcp_endpoint: openAiPluginConstants.endpoint,
      oauth_issuer: openAiPluginConstants.issuer,
      api_image_digest: apiImageDigest ?? null
    },
    registered_connection_id: validation.connectionId ?? null,
    package: {
      archive_file: `debugbundle-openai-plugin-${openAiPluginConstants.version}.zip`,
      archive_sha256: sha256Bytes(pluginArchive),
      archive_bytes: pluginArchive.length,
      files: inputs.plugin
    },
    submission: { files: inputs.submission },
    contract: {
      tools_in_scan_order: contract.tools.map((tool) => tool.name),
      tool_contract_sha256: inputs.contracts["tests/fixtures/openai-plugin-v1/tool-contracts.json"],
      schemas_sha256: inputs.contracts["tests/fixtures/openai-plugin-v1/schemas.json"],
      data_map_sha256: inputs.contracts["contracts/openai-plugin-v1-data-map.md"],
      reviewer_fixture_sha256:
        inputs.contracts["tests/fixtures/openai-plugin-v1/reviewer-tenant.json"]
    },
    manual_gates: manualGates(validation, apiImageDigest),
    automation_boundary: {
      portal_login: false,
      submit_or_cancel_review: false,
      publish_or_unpublish: false,
      directory_edit: false,
      announcement_or_communication: false,
      recurring_spend: false,
      deployment_or_infrastructure_mutation: false
    }
  };
}

function candidatePaths(outputRoot) {
  return {
    plugin: join(outputRoot, `debugbundle-openai-plugin-${openAiPluginConstants.version}.zip`),
    packet: join(outputRoot, `debugbundle-openai-submission-${openAiPluginConstants.version}.zip`),
    checksums: join(outputRoot, "SHA256SUMS")
  };
}

function readRecordedSourceCommit() {
  if (!existsSync(releaseManifestPath)) return undefined;
  return readJson(releaseManifestPath)?.source?.commit;
}

function releaseChecksums(paths, pluginArchive, packetArchive) {
  return `${[
    `${sha256Bytes(pluginArchive)}  ${paths.plugin.split("/").at(-1)}`,
    `${sha256Bytes(packetArchive)}  ${paths.packet.split("/").at(-1)}`
  ].join("\n")}\n`;
}

function prepare(args) {
  const validation = validateOpenAiPluginSource({ requireConnection: args.requireConnection });
  if (!validation.ok)
    throw new Error(`source_validation_failed:\n${validation.failures.join("\n")}`);

  const pluginArchive = buildDeterministicZip(pluginArchiveEntries());
  const manifest = buildManifest(
    validation,
    pluginArchive,
    args.apiImageDigest,
    readRecordedSourceCommit()
  );
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(releaseManifestPath, manifestBytes);

  const packetArchive = buildDeterministicZip(packetArchiveEntries(manifestBytes));
  const paths = candidatePaths(args.outputRoot);
  mkdirSync(args.outputRoot, { recursive: true });
  writeFileSync(paths.plugin, pluginArchive);
  writeFileSync(paths.packet, packetArchive);
  writeFileSync(paths.checksums, releaseChecksums(paths, pluginArchive, packetArchive), "utf8");

  return { validation, manifest, paths, packet_sha256: sha256Bytes(packetArchive) };
}

function verify(args) {
  const validation = validateOpenAiPluginSource({ requireConnection: args.requireConnection });
  if (!validation.ok) return { ok: false, failures: validation.failures };
  if (!existsSync(releaseManifestPath)) {
    return { ok: false, failures: ["release_manifest_missing"] };
  }

  const currentArchive = buildDeterministicZip(pluginArchiveEntries());
  const actualManifest = readJson(releaseManifestPath);
  const recordedApiImageDigest = actualManifest?.runtime?.api_image_digest;
  if (
    recordedApiImageDigest !== null &&
    recordedApiImageDigest !== undefined &&
    !/^sha256:[0-9a-f]{64}$/u.test(recordedApiImageDigest)
  ) {
    return {
      ok: false,
      failures: ["release_manifest_invalid_api_image_digest"],
      validation
    };
  }
  const apiImageDigest = args.apiImageDigest ?? recordedApiImageDigest ?? undefined;
  const expectedManifest = buildManifest(
    validation,
    currentArchive,
    apiImageDigest,
    actualManifest?.source?.commit
  );
  const failures = [];
  if (stableJson(actualManifest) !== stableJson(expectedManifest)) {
    failures.push("release_manifest_drift");
  }
  const expectedManifestBytes = Buffer.from(
    `${JSON.stringify(expectedManifest, null, 2)}\n`,
    "utf8"
  );
  const expectedPacket = buildDeterministicZip(packetArchiveEntries(expectedManifestBytes));
  const paths = candidatePaths(args.outputRoot);
  const artifactPaths = [paths.plugin, paths.packet, paths.checksums];
  const existingArtifactCount = artifactPaths.filter((path) => existsSync(path)).length;
  if (existingArtifactCount > 0 && existingArtifactCount !== artifactPaths.length) {
    failures.push("release_artifact_set_incomplete");
  }
  if (
    existsSync(paths.plugin) &&
    sha256Bytes(readFileSync(paths.plugin)) !== sha256Bytes(currentArchive)
  ) {
    failures.push("plugin_archive_drift");
  }
  if (
    existsSync(paths.packet) &&
    sha256Bytes(readFileSync(paths.packet)) !== sha256Bytes(expectedPacket)
  ) {
    failures.push("submission_packet_drift");
  }
  if (
    existsSync(paths.checksums) &&
    readFileSync(paths.checksums, "utf8") !==
      releaseChecksums(paths, currentArchive, expectedPacket)
  ) {
    failures.push("release_checksums_drift");
  }
  return { ok: failures.length === 0, failures, validation, manifest: expectedManifest };
}

function plan(args) {
  const validation = validateOpenAiPluginSource({ requireConnection: false });
  return {
    command: "prepare",
    version: openAiPluginConstants.version,
    independent_from_npm_mcp_version: true,
    source_validation: validation,
    output_root: args.outputRoot,
    allowed_actions: [
      "validate_source",
      "build_deterministic_archives",
      "record_non_secret_hashes",
      "generate_submission_packet"
    ],
    prohibited_actions: [
      "portal_login",
      "submit",
      "cancel_review",
      "publish",
      "directory_edit",
      "announcement",
      "spend",
      "deployment"
    ]
  };
}

function help() {
  return {
    usage:
      "node scripts/release-openai-plugin.mjs <plan|validate|prepare|verify> [--json] [--require-connection] [--api-image-digest sha256:...] [--output path]",
    note: "This driver never performs portal, publication, communication, spend, deployment, DNS, Caddy, or secret actions."
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.command === "help") result = help();
  else if (args.command === "plan") result = plan(args);
  else if (args.command === "validate") {
    result = validateOpenAiPluginSource({ requireConnection: args.requireConnection });
  } else if (args.command === "prepare") result = prepare(args);
  else result = verify(args);

  if (args.json || args.command === "plan" || args.command === "help") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok === false || result.validation?.ok === false) {
    for (const failure of result.failures ?? result.validation.failures) {
      process.stderr.write(`${failure}\n`);
    }
  } else {
    process.stdout.write(
      `OpenAI plugin ${openAiPluginConstants.version} ${args.command} passed.\n`
    );
  }

  if (result.ok === false || result.validation?.ok === false) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
