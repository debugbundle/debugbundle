#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_THRESHOLD = 80;
const METRICS = ["statements", "lines", "functions", "branches"];

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function canUseGit() {
  try {
    run("git --version");
    return true;
  } catch {
    return false;
  }
}

function normalizeToWorkspaceRelative(filePath) {
  const workspace = process.cwd();
  const normalized = filePath.replaceAll("\\", "/");
  const workspaceNormalized = workspace.replaceAll("\\", "/");

  if (normalized.startsWith(`${workspaceNormalized}/`)) {
    return normalized.slice(workspaceNormalized.length + 1);
  }

  if (normalized.startsWith("./")) {
    return normalized.slice(2);
  }

  return normalized;
}

function getChangedFiles() {
  if (!canUseGit()) {
    console.warn("coverage:changed: git unavailable; skipping changed-file coverage check");
    return [];
  }

  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA || "HEAD";

  if (baseSha) {
    let diffRange = "HEAD~1...HEAD";
    try {
      run(`git rev-parse --verify ${baseSha}`);
      diffRange = `${baseSha}...${headSha}`;
    } catch {
      console.warn(`coverage:changed: unable to verify BASE_SHA=${baseSha}; falling back to ${diffRange}`);
    }

    const output = run(`git diff --name-only --diff-filter=ACMR ${diffRange}`);
    if (!output) {
      return [];
    }

    return output
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const trackedOutput = run("git diff --name-only --diff-filter=ACMR HEAD");
  const untrackedOutput = run("git ls-files --others --exclude-standard");

  return [...new Set([
    ...trackedOutput.split("\n"),
    ...untrackedOutput.split("\n")
  ].map((value) => value.trim()).filter(Boolean))];
}

function isSourceCandidate(filePath) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
    return false;
  }

  if (filePath.startsWith("tests/")) {
    return false;
  }

  if (/\.test\./.test(filePath)) {
    return false;
  }

  if (filePath.startsWith(".github/")) {
    return false;
  }

  if (/^apps\/[^/]+\/src\//.test(filePath)) {
    return true;
  }

  if (/^packages\/[^/]+\/src\//.test(filePath)) {
    return true;
  }

  // Keep schema bootstrap in scope as executable product behavior.
  if (filePath === "scripts/bootstrap-storage.ts") {
    return true;
  }

  return false;
}

function loadCoverageSummary() {
  const summaryPath = path.join(process.cwd(), "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    throw new Error("coverage summary missing at coverage/coverage-summary.json; run tests with coverage before coverage:changed");
  }

  const raw = readFileSync(summaryPath, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "total") {
      continue;
    }

    map.set(normalizeToWorkspaceRelative(key), value);
  }

  return map;
}

function stripComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|\s)\/\/.*$/gm, "");
}

function isTypeOnlyModule(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    return false;
  }

  const source = stripComments(readFileSync(absolutePath, "utf8"));
  const normalized = source.replaceAll(/\s+/g, " ").trim();

  if (normalized.length === 0 || normalized === "export {};") {
    return true;
  }

  const hasRuntimeImport = /\bimport\s+(?!type\b)/.test(normalized);
  const hasRuntimeExport = /\bexport\s+(async\s+)?(function|class|const|let|var|enum)\b/.test(normalized);
  const hasRuntimeDeclaration = /\b(async\s+)?function\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|\benum\b/.test(normalized);

  return !hasRuntimeImport && !hasRuntimeExport && !hasRuntimeDeclaration;
}

function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function main() {
  const changedFiles = getChangedFiles();
  const candidates = changedFiles.filter(isSourceCandidate);

  if (candidates.length === 0) {
    console.log("coverage:changed: no changed source files detected; skipping");
    return;
  }

  const coverageMap = loadCoverageSummary();
  const failures = [];

  for (const file of candidates) {
    const coverage = coverageMap.get(file);
    if (!coverage) {
      if (isTypeOnlyModule(file)) {
        continue;
      }

      failures.push(`${file}: no coverage entry found`);
      continue;
    }

    const metricFailures = METRICS
      .map((metric) => {
        const pct = coverage?.[metric]?.pct;
        return { metric, pct };
      })
      .filter(({ pct }) => typeof pct !== "number" || pct < REQUIRED_THRESHOLD)
      .map(({ metric, pct }) => `${metric}=${formatMetric(pct)}%`);

    if (metricFailures.length > 0) {
      failures.push(`${file}: ${metricFailures.join(", ")} (required >= ${REQUIRED_THRESHOLD}%)`);
    }

  }

  if (failures.length > 0) {
    console.error("coverage:changed: required thresholds not met");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`coverage:changed: passed for ${candidates.length} changed source file(s)`);
}

main();
