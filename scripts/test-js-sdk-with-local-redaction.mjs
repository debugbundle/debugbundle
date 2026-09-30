import { access, lstat, mkdir, open, readFile, readlink, symlink, unlink } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const sdkRoot = path.join(root, "sdks", "debugbundle-js");
const packageVersion = JSON.parse(await readFile(path.join(root, "packages", "redaction", "package.json"), "utf8")).version;
const tarball = path.join(root, ".tmp", "apache-packages", `debugbundle-redaction-${packageVersion}.tgz`);
const sharedVersion = JSON.parse(await readFile(path.join(root, "packages", "shared-types", "package.json"), "utf8")).version;
const sharedTarball = path.join(root, ".tmp", "apache-packages", `debugbundle-shared-types-${sharedVersion}.tgz`);
// Source and packed-consumer checks temporarily share dependency links. Refuse
// overlapping runs so one process cannot restore another process's temporary link.
const lockPath = path.join(root, ".tmp", "privacy-js-verification.lock");
await mkdir(path.dirname(lockPath), { recursive: true });
const lock = await open(lockPath, "wx").catch(() => {
  throw new Error("privacy_js_verification_already_running_or_lock_unavailable");
});
const unpackRoot = mkdtempSync(path.join(tmpdir(), "debugbundle-redaction-"));
const prepared = path.join(unpackRoot, "package");
const sharedUnpackRoot = mkdtempSync(path.join(tmpdir(), "debugbundle-shared-types-"));
const sharedPrepared = path.join(sharedUnpackRoot, "package");
const links = ["sdk-node", "sdk-browser"].map((name) =>
  path.join(sdkRoot, "packages", name, "node_modules", "@debugbundle", "redaction")
);
links.push(path.join(sdkRoot, "node_modules", "@debugbundle", "redaction"));
const sharedLinks = ["sdk-node", "sdk-browser"].map((name) =>
  path.join(sdkRoot, "packages", name, "node_modules", "@debugbundle", "shared-types")
);
sharedLinks.push(path.join(sdkRoot, "node_modules", "@debugbundle", "shared-types"));
const candidateLinks = [...links.map((link) => ({ link, prepared })), ...sharedLinks.map((link) => ({ link, prepared: sharedPrepared }))];
const originals = [];

try {
  const extraction = spawnSync("tar", ["-xzf", tarball, "-C", unpackRoot], { stdio: "inherit" });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error("redaction_package_extract_failed");
  const sharedExtraction = spawnSync("tar", ["-xzf", sharedTarball, "-C", sharedUnpackRoot], { stdio: "inherit" });
  if (sharedExtraction.error) throw sharedExtraction.error;
  if (sharedExtraction.status !== 0) throw new Error("shared_types_package_extract_failed");
  // TypeScript resolves dependencies from the extracted candidate, outside the SDK workspace.
  await mkdir(path.join(sharedPrepared, "node_modules"), { recursive: true });
  await symlink(
    path.join(sdkRoot, "packages", "sdk-node", "node_modules", "zod"),
    path.join(sharedPrepared, "node_modules", "zod")
  );
  for (const { link, prepared: candidate } of candidateLinks) {
    const existing = await lstat(link).catch(() => null);
    if (existing !== null && !existing.isSymbolicLink()) throw new Error(`expected dependency symlink: ${link}`);
    const original = existing === null ? null : await readlink(link);
    if (original !== null) await access(link); // Refuse pre-existing dangling dependencies.
    originals.push({ link, original });
    if (existing !== null) await unlink(link);
    await symlink(path.relative(path.dirname(link), candidate), link);
  }

  const commands = process.argv.includes("--candidate")
    ? [["lint"], ["typecheck"], ["test:coverage"], ["build"], ["smoke:packed"]]
    : process.argv.includes("--consumer")
    ? [["build"], ["smoke:packed"]]
    : [["lint"], ["typecheck"], ["exec", "vitest", "run", "--config", "vitest.config.ts", "--reporter=dot", ...process.argv.slice(2)]];
  for (const command of commands) {
    const child = spawnSync("corepack", ["pnpm", "--dir", sdkRoot, ...command], {
      cwd: root,
      // pnpm's automatic pre-run install would replace this candidate link
      // with the registry package. Keep this override scoped to the harness.
      env: { ...process.env, npm_config_verify_deps_before_run: "false", PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "false", CI: "true", DEBUGBUNDLE_SMOKE_REDACTION_TARBALL: tarball,
        DEBUGBUNDLE_SMOKE_SHARED_TYPES_TARBALL: sharedTarball },
      stdio: "inherit"
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`js_sdk_${command[0]}_failed:${child.status}`);
    for (const { link, prepared: candidate } of candidateLinks) {
      if (path.resolve(path.dirname(link), await readlink(link)) !== candidate) {
        throw new Error("sdk_candidate_link_replaced_during_verification");
      }
    }
  }
} finally {
  try {
    for (const { link, original } of originals.reverse()) {
      await unlink(link);
      if (original !== null) await symlink(original, link);
    }
  } finally {
    rmSync(unpackRoot, { recursive: true, force: true });
    rmSync(sharedUnpackRoot, { recursive: true, force: true });
    await lock.close();
    await unlink(lockPath);
  }
}
