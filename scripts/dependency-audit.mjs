// SPDX-License-Identifier: Apache-2.0
// Shared with the independently owned site checkout by an identical vendored copy.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const advisoryId = "GHSA-mrhx-c7xc-m3w5";
const legacyVersion = "3.25.76";
const severities = ["info", "low", "moderate", "high", "critical"];
const patchedFiles = ["v3/types.cjs", "v3/types.js", "v4/core/schemas.cjs", "v4/core/schemas.js"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function evaluateAudit(
  report,
  { verifiedLegacyBackport = false, auditLevel = "high" } = {}
) {
  if (
    !severities.includes(auditLevel) ||
    !report ||
    typeof report.advisories !== "object" ||
    report.advisories === null ||
    Array.isArray(report.advisories)
  )
    throw new Error("invalid_audit_report");
  const metadata = report.metadata?.vulnerabilities;
  if (
    !metadata ||
    severities.some((level) => !Number.isInteger(metadata[level]) || metadata[level] < 0)
  ) {
    throw new Error("invalid_audit_metadata");
  }
  const advisories = Object.values(report.advisories);
  if (severities.reduce((total, level) => total + metadata[level], 0) !== advisories.length) {
    throw new Error("audit_metadata_mismatch");
  }
  const remaining = Object.fromEntries(severities.map((level) => [level, 0]));
  let accountedFindings = 0;
  for (const advisory of advisories) {
    if (
      !advisory ||
      !severities.includes(advisory.severity) ||
      !Array.isArray(advisory.findings) ||
      advisory.findings.length === 0
    )
      throw new Error("invalid_audit_advisory");
    const unaccounted = advisory.findings.filter((finding) => {
      if (!finding || typeof finding.version !== "string" || !Array.isArray(finding.paths)) {
        throw new Error("invalid_audit_finding");
      }
      const accounted =
        verifiedLegacyBackport &&
        advisory.github_advisory_id === advisoryId &&
        advisory.module_name === "zod" &&
        finding.version === legacyVersion;
      if (accounted) accountedFindings += 1;
      return !accounted;
    });
    if (unaccounted.length > 0) remaining[advisory.severity] += 1;
  }
  return {
    passed: severities
      .slice(severities.indexOf(auditLevel))
      .every((level) => remaining[level] === 0),
    remaining,
    accountedFindings
  };
}

export function collectLegacyRoots(graph) {
  if (!Array.isArray(graph)) throw new Error("invalid_dependency_graph");
  const roots = new Set();
  function visit(value, key) {
    if (value === null || typeof value !== "object") return;
    if (key === "zod" && value.version === legacyVersion) {
      if (typeof value.path !== "string") throw new Error("missing_dependency_path");
      roots.add(value.path);
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  }
  visit(graph);
  return [...roots];
}

export function verifyLegacyBackport(root, packageRoots) {
  const policy = JSON.parse(readFileSync(join(root, "patches/zod-security-backport.json"), "utf8"));
  if (
    policy.advisory !== advisoryId ||
    policy.version !== legacyVersion ||
    Object.keys(policy.files ?? {})
      .sort()
      .join() !== patchedFiles.join() ||
    !/^[a-f0-9]{64}$/u.test(policy.patch_sha256 ?? "")
  )
    throw new Error("invalid_backport_policy");
  if (sha256(readFileSync(join(root, "patches/zod@3.25.76.patch"))) !== policy.patch_sha256) {
    throw new Error("backport_patch_mismatch");
  }
  if (packageRoots.length === 0) throw new Error("legacy_dependency_not_verified");
  const moduleRoot = realpathSync(join(root, "node_modules")) + sep;
  for (const directory of packageRoots) {
    const packageRoot = realpathSync(directory);
    if (!packageRoot.startsWith(moduleRoot)) throw new Error("dependency_outside_installation");
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    if (manifest.name !== "zod" || manifest.version !== legacyVersion)
      throw new Error("backport_version_mismatch");
    for (const file of patchedFiles) {
      if (
        !/^[a-f0-9]{64}$/u.test(policy.files[file]) ||
        sha256(readFileSync(join(packageRoot, file))) !== policy.files[file]
      ) {
        throw new Error(`backport_file_mismatch:${file}`);
      }
    }
    // Byte verification is paired with a small semantic check, not a version-only waiver.
    const require = createRequire(join(packageRoot, "package.json"));
    for (const entry of ["./v3/index.cjs", "./v4/index.cjs"]) {
      const z = require(entry);
      let visits = 0;
      const element = z.preprocess((value) => {
        visits += 1;
        return value;
      }, z.string());
      const result = z.array(element).max(1).safeParse([0, 1]);
      if (result.success || visits !== 0) throw new Error("backport_semantic_check_failed");
    }
  }
  return packageRoots.length;
}

function runPnpm(root, args, allowedStatuses = [0]) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || !allowedStatuses.includes(result.status))
    throw new Error("dependency_command_failed");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("dependency_command_invalid_json");
  }
}

export function runAudit(root = process.cwd(), auditLevel = "high") {
  const report = runPnpm(root, ["audit", "--json"], [0, 1]);
  // Validate all metadata before inspecting or accounting for any finding.
  evaluateAudit(report, { auditLevel });
  const needsBackport = Object.values(report.advisories).some(
    (advisory) =>
      advisory.github_advisory_id === advisoryId &&
      advisory.module_name === "zod" &&
      advisory.findings.some((finding) => finding.version === legacyVersion)
  );
  const verifiedInstances = needsBackport
    ? verifyLegacyBackport(
        root,
        collectLegacyRoots(
          runPnpm(root, ["list", "zod", "--depth", "Infinity", "--recursive", "--json"])
        )
      )
    : 0;
  return {
    ...evaluateAudit(report, { auditLevel, verifiedLegacyBackport: verifiedInstances > 0 }),
    verifiedBackport:
      verifiedInstances > 0
        ? { advisory: advisoryId, version: legacyVersion, instances: verifiedInstances }
        : null
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length > 1 ||
      (args[0] && !/^--audit-level=(?:info|low|moderate|high|critical)$/u.test(args[0]))
    ) {
      throw new Error("invalid_audit_options");
    }
    const result = runAudit(process.cwd(), args[0]?.split("=")[1] ?? "high");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `Dependency audit failed closed: ${error instanceof Error ? error.message : "unknown_error"}\n`
    );
    process.exitCode = 1;
  }
}
