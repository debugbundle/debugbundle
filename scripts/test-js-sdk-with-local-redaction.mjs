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
// Source and packed-consumer checks temporarily share dependency links. Refuse
// overlapping runs so one process cannot restore another process's temporary link.
const lockPath = path.join(root, ".tmp", "privacy-js-verification.lock");
await mkdir(path.dirname(lockPath), { recursive: true });
const lock = await open(lockPath, "wx").catch(() => {
  throw new Error("privacy_js_verification_already_running_or_lock_unavailable");
});
const unpackRoot = mkdtempSync(path.join(tmpdir(), "debugbundle-redaction-"));
const prepared = path.join(unpackRoot, "package");
const links = ["sdk-node", "sdk-browser"].map((name) =>
  path.join(sdkRoot, "packages", name, "node_modules", "@debugbundle", "redaction")
);
links.push(path.join(sdkRoot, "node_modules", "@debugbundle", "redaction"));
const originals = [];

try {
  const extraction = spawnSync("tar", ["-xzf", tarball, "-C", unpackRoot], { stdio: "inherit" });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error("redaction_package_extract_failed");
  for (const link of links) {
    const existing = await lstat(link).catch(() => null);
    if (existing !== null && !existing.isSymbolicLink()) throw new Error(`expected dependency symlink: ${link}`);
    const original = existing === null ? null : await readlink(link);
    if (original !== null) await access(link); // Refuse pre-existing dangling dependencies.
    originals.push({ link, original });
    if (existing !== null) await unlink(link);
    await symlink(path.relative(path.dirname(link), prepared), link);
  }

  const commands = process.argv.includes("--consumer")
    ? [["build"], ["smoke:packed"]]
    : [["lint"], ["typecheck"], ["exec", "vitest", "run", "--config", "vitest.config.ts", "--reporter=dot", ...process.argv.slice(2)]];
  for (const command of commands) {
    const child = spawnSync("corepack", ["pnpm", "--dir", sdkRoot, ...command], {
      cwd: root,
      env: { ...process.env, DEBUGBUNDLE_SMOKE_REDACTION_TARBALL: tarball },
      stdio: "inherit"
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`js_sdk_${command[0]}_failed:${child.status}`);
  }
} finally {
  try {
    for (const { link, original } of originals.reverse()) {
      await unlink(link);
      if (original !== null) await symlink(original, link);
    }
  } finally {
    rmSync(unpackRoot, { recursive: true, force: true });
    await lock.close();
    await unlink(lockPath);
  }
}
