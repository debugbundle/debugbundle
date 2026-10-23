// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { collectLegacyRoots, evaluateAudit, verifyLegacyBackport } from "./dependency-audit.mjs";

const root = process.cwd();
function report(versions = ["3.25.76"], options = {}) {
  return {
    advisories: {
      one: {
        github_advisory_id: options.id ?? "GHSA-mrhx-c7xc-m3w5",
        module_name: options.module ?? "zod",
        severity: options.severity ?? "high",
        findings: versions.map((version) => ({ version, paths: [".>zod"] }))
      }
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        [options.severity ?? "high"]: 1
      }
    }
  };
}

test("an unverified legacy finding remains a failing high finding", () => {
  const result = evaluateAudit(report());
  assert.equal(result.passed, false);
  assert.equal(result.accountedFindings, 0);
});

test("only the exact verified advisory, module and version are accounted for", () => {
  assert.equal(evaluateAudit(report(), { verifiedLegacyBackport: true }).passed, true);
  for (const input of [
    report(["3.25.75"]),
    report(["4.4.3"]),
    report(undefined, { id: "GHSA-other" }),
    report(undefined, { module: "other" })
  ]) {
    assert.equal(evaluateAudit(input, { verifiedLegacyBackport: true }).passed, false);
  }
});

test("mixed vulnerable versions and unrelated critical findings still fail", () => {
  const mixed = evaluateAudit(report(["3.25.76", "4.4.3"]), { verifiedLegacyBackport: true });
  assert.equal(mixed.passed, false);
  assert.equal(mixed.remaining.high, 1);
  assert.equal(mixed.accountedFindings, 1);
  assert.equal(
    evaluateAudit(report(["1.0.0"], { id: "GHSA-unrelated", severity: "critical" }), {
      verifiedLegacyBackport: true
    }).passed,
    false
  );
});

test("each caller retains its own severity threshold", () => {
  const moderate = report(["1.0.0"], { id: "GHSA-other", severity: "moderate" });
  assert.equal(evaluateAudit(moderate, { auditLevel: "high" }).passed, true);
  assert.equal(evaluateAudit(moderate, { auditLevel: "low" }).passed, false);
});

test("missing, malformed and inconsistent reports fail closed", () => {
  for (const value of [null, {}, { advisories: {} }, { advisories: [], metadata: {} }]) {
    assert.throws(() => evaluateAudit(value));
  }
  const mismatch = report();
  mismatch.advisories = {};
  assert.throws(() => evaluateAudit(mismatch), /audit_metadata_mismatch/u);
  assert.throws(() => evaluateAudit(report(), { auditLevel: "unknown" }));
});

test("every active legacy instance has the approved patch and compiled bytes", () => {
  const result = spawnSync(
    "pnpm",
    ["list", "zod", "--depth", "Infinity", "--recursive", "--json"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  assert.equal(result.status, 0);
  const roots = collectLegacyRoots(JSON.parse(result.stdout));
  assert.ok(roots.length > 0);
  assert.equal(verifyLegacyBackport(root, roots), roots.length);
});

test("a drifted or missing installed file cannot satisfy the backport policy", () => {
  const temporary = mkdtempSync(join(tmpdir(), "debugbundle-audit-"));
  try {
    const policy = JSON.parse(
      readFileSync(join(root, "patches/zod-security-backport.json"), "utf8")
    );
    const packageRoot = join(temporary, "node_modules/zod");
    mkdirSync(join(temporary, "patches"), { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    for (const file of ["zod-security-backport.json", "zod@3.25.76.patch"]) {
      copyFileSync(join(root, "patches", file), join(temporary, "patches", file));
    }
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({ name: "zod", version: "3.25.76" })
    );
    for (const file of Object.keys(policy.files)) {
      mkdirSync(dirname(join(packageRoot, file)), { recursive: true });
      writeFileSync(join(packageRoot, file), "unpatched\n");
    }
    assert.throws(() => verifyLegacyBackport(temporary, [packageRoot]), /backport_file_mismatch/u);
    assert.throws(() => verifyLegacyBackport(temporary, []), /legacy_dependency_not_verified/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("unknown CLI options fail before any audit request", () => {
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts/dependency-audit.mjs"), "--ignore-all"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid_audit_options/u);
});
