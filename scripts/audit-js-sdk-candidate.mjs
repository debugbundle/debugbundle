import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Audit the same isolated installed consumer used by the package smoke. Nothing
// in the workspace dependency graph is installed or automatically upgraded.
const root = process.cwd();
const consumer = mkdtempSync(path.join(tmpdir(), "debugbundle-sdk-audit-"));
try {
  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true }));
  const packages = ["shared-types", "redaction"].map((name) => {
    const { version } = JSON.parse(readFileSync(path.join(root, "packages", name, "package.json")));
    return path.join(root, ".tmp", "apache-packages", `debugbundle-${name}-${version}.tgz`);
  });
  for (const name of ["node", "browser"]) {
    const { version } = JSON.parse(
      readFileSync(path.join(root, "sdks/debugbundle-js/packages", `sdk-${name}`, "package.json"))
    );
    packages.push(
      path.join(root, ".tmp", "sdk-js-candidate", `debugbundle-sdk-${name}-${version}.tgz`)
    );
  }
  const installed = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--no-fund", "express@5.1.0", ...packages],
    {
      cwd: consumer,
      encoding: "utf8"
    }
  );
  if (installed.status !== 0) throw new Error(installed.stderr);
  const audit = spawnSync("npm", ["audit", "--json"], { cwd: consumer, encoding: "utf8" });
  writeFileSync(path.join(root, ".tmp", "sdk-js-candidate", "npm-audit.json"), audit.stdout);
  process.stdout.write(audit.stdout);
  if (audit.stderr) process.stderr.write(audit.stderr);
  process.exitCode = audit.status ?? 1;
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
