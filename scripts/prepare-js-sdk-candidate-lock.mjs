import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd(),
  sdkRoot = path.join(root, "sdks/debugbundle-js");
const lockPath = path.join(sdkRoot, "pnpm-lock.yaml");
const original = readFileSync(lockPath, "utf8");
const markers = ["\npackages:\n", "\nsnapshots:\n"];
const packagesAt = original.indexOf(markers[0]),
  snapshotsAt = original.indexOf(markers[1]);
if (packagesAt < 0 || snapshotsAt < packagesAt) throw new Error("unsupported_sdk_lock_shape");
let importers = original.slice(0, packagesAt),
  packages = original.slice(packagesAt, snapshotsAt),
  snapshots = original.slice(snapshotsAt);

const zodConstraint = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).dependencies
  .zod;
const zodVersion = JSON.parse(
  readFileSync(path.join(root, "node_modules/zod/package.json"), "utf8")
).version;
if (zodConstraint !== "^4.6.7" || zodVersion !== "4.6.7")
  throw new Error("candidate_zod_version_requires_review");
const zodPackage = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8").match(
  /\n  zod@4\.6\.7:\n    resolution:\s*\{\s*integrity: ([^\s,}]+)\s*\}/
);
if (!zodPackage) throw new Error("candidate_zod_resolution_missing");
let zodCount = 0;
importers = importers.replace(
  /(      zod:\n)        specifier: [^\n]+\n        version: [^\n]+/g,
  (_, prefix) => {
    zodCount++;
    return `${prefix}        specifier: ${zodConstraint}\n        version: ${zodVersion}`;
  }
);
if (zodCount !== 1) throw new Error("unexpected_sdk_zod_importer_count");
zodCount = 0;
packages = packages.replace(/\n  zod@[^:\n]+:\n    resolution: \{integrity: [^\n]+\}/g, () => {
  zodCount++;
  return `\n  zod@${zodVersion}:\n    resolution: {integrity: ${zodPackage[1]}}`;
});
if (zodCount !== 1) throw new Error("unexpected_sdk_zod_package_count");
zodCount = 0;
snapshots = snapshots.replace(/\n  zod@[^:\n]+: \{\}/g, () => {
  zodCount++;
  return `\n  zod@${zodVersion}: {}`;
});
if (zodCount !== 1) throw new Error("unexpected_sdk_zod_snapshot_count");

for (const name of ["shared-types", "redaction"]) {
  const packageName = `@debugbundle/${name}`;
  const version = JSON.parse(
    readFileSync(path.join(root, "packages", name, "package.json"), "utf8")
  ).version;
  const tarball = path.join(root, ".tmp/apache-packages", `debugbundle-${name}-${version}.tgz`);
  const bytes = readFileSync(tarball);
  const packed = JSON.parse(
    execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" })
  );
  if (packed.name !== packageName || packed.version !== version)
    throw new Error("candidate_package_identity_mismatch");
  // Refresh only these owned archives and the explicitly approved Zod 4 graph.
  // Unknown dependency additions still require normal resolution and review.
  const dependencies = packed.dependencies ?? {};
  if (
    name === "shared-types"
      ? JSON.stringify(dependencies) !== JSON.stringify({ zod: zodConstraint })
      : Object.keys(dependencies).length !== 0
  )
    throw new Error("candidate_dependency_graph_requires_lock_regeneration");
  for (const relative of [
    "package.json",
    "packages/sdk-node/package.json",
    "packages/sdk-browser/package.json"
  ]) {
    const manifest = JSON.parse(readFileSync(path.join(sdkRoot, relative), "utf8"));
    if ((manifest.dependencies ?? manifest.devDependencies)[packageName] !== version)
      throw new Error("sdk_candidate_dependency_floor_mismatch");
  }
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  importers = importers.replace(
    new RegExp(
      `(      '${escaped}':\\n)        specifier: [^\\n]+\\n        version: [^\\n]+`,
      "g"
    ),
    (_, prefix) => {
      count++;
      return `${prefix}        specifier: ${version}\n        version: ${version}`;
    }
  );
  if (count !== 3) throw new Error("unexpected_sdk_dependency_importer_count");
  count = 0;
  packages = packages.replace(
    new RegExp(`  '${escaped}@[^']+':\\n    resolution: \\{integrity: [^\\n]+\\}`, "g"),
    () => {
      count++;
      return `  '${packageName}@${version}':\n    resolution: {integrity: ${integrity}}`;
    }
  );
  if (count !== 1) throw new Error("unexpected_sdk_package_resolution_count");
  count = 0;
  snapshots = snapshots.replace(new RegExp(`  '${escaped}@[^']+':`, "g"), () => {
    count++;
    return `  '${packageName}@${version}':`;
  });
  if (count !== 1) throw new Error("unexpected_sdk_package_snapshot_count");
  if (name === "shared-types") {
    let dependencyCount = 0;
    snapshots = snapshots.replace(
      new RegExp(`(  '${escaped}@${version}':\\n    dependencies:\\n      zod:) [^\\n]+`),
      (_, prefix) => {
        dependencyCount++;
        return `${prefix} ${zodVersion}`;
      }
    );
    if (dependencyCount !== 1) throw new Error("unexpected_shared_zod_dependency_count");
  }
}
const candidate = importers + packages + snapshots;
if (process.argv.includes("--check")) {
  if (candidate !== original) throw new Error("sdk_candidate_lock_is_stale");
} else writeFileSync(lockPath, candidate);
