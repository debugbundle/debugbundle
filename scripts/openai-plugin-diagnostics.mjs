import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildDeterministicZip } from "./deterministic-zip.mjs";
import {
  openAiPluginConstants,
  portalPluginArchiveEntries,
  repoRoot,
  sha256Bytes,
  validateOpenAiPluginSource
} from "./openai-plugin-release-lib.mjs";

const variants = [{ id: "isolated-compatibility", name: "debugbundle-cimd-isolated" }];
const manifestPath = "debugbundle/.codex-plugin/plugin.json";

function jsonEntry(path, value) {
  return { path, bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8") };
}

export function diagnosticPluginArchiveEntries(variantId) {
  const variant = variants.find((candidate) => candidate.id === variantId);
  if (variant === undefined) throw new Error(`unknown_diagnostic_variant:${variantId}`);
  const source = portalPluginArchiveEntries();
  const manifest = JSON.parse(source.find((entry) => entry.path === manifestPath).bytes);
  manifest.name = variant.name;

  // Identity alone is the experiment; all other package bytes remain identical.
  return source.map((entry) =>
    entry.path === manifestPath ? jsonEntry(manifestPath, manifest) : entry
  );
}

function prepare(outputRoot) {
  const validation = validateOpenAiPluginSource();
  if (!validation.ok) throw new Error(`source_validation_failed:${validation.failures.join(",")}`);
  const archives = variants.map((variant) => {
    const bytes = buildDeterministicZip(diagnosticPluginArchiveEntries(variant.id));
    return {
      bytes,
      report: {
        id: variant.id,
        package_name: variant.name,
        format: "codex-compatibility",
        archive_file: `${variant.name}-${openAiPluginConstants.version}.zip`,
        archive_sha256: sha256Bytes(bytes),
        archive_bytes: bytes.length
      }
    };
  });
  mkdirSync(outputRoot, { recursive: true });
  for (const archive of archives) {
    writeFileSync(join(outputRoot, archive.report.archive_file), archive.bytes);
  }
  const report = {
    diagnostic_only: true,
    version: openAiPluginConstants.version,
    endpoint: openAiPluginConstants.endpoint,
    registration: "cimd",
    variants: archives.map((archive) => archive.report)
  };
  writeFileSync(join(outputRoot, "diagnostics.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let outputRoot = join(
      repoRoot,
      "dist",
      "openai-plugin-diagnostics",
      openAiPluginConstants.version
    );
    if (args.length > 0) {
      if (args[0] !== "--output") throw new Error(`unknown_option:${args[0]}`);
      if (args.length !== 2 || !args[1] || args[1].startsWith("--")) {
        throw new Error("invalid_output_option");
      }
      outputRoot = resolve(args[1]);
    }
    process.stdout.write(`${JSON.stringify(prepare(outputRoot), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
