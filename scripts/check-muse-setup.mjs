import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const binary = resolve(process.argv[3]);
const hashes = {
  arm64: "5e5ea2a3de3a3fabdff8982aec9423d20eaa7dad05df37efb4264356d0d2e223",
  x64: "71b089d055dfe6e4562092bc484896b61bd96fd6ef9fef9da54a14aa174e2a33"
};
const sizes = { arm64: 281942104, x64: 313800920 };
assert.ok(hashes[process.arch], "Muse verification supports Linux arm64 and x64.");
// Pins come from Meta's public 1.3.0-R3401.1 release manifest, not the moving channel.
if (process.argv[2] === "--download") {
  const cached = await readFile(binary).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (!cached || createHash("sha256").update(cached).digest("hex") !== hashes[process.arch]) {
    const platform = process.arch === "arm64" ? "aarch64" : "x86";
    const response = await fetch(
      `https://lookaside.facebook.com/lookaside/muse/download/?channel=muse&version=1.3.0-R3401.1&file=muse-${platform}-linux`,
      { signal: AbortSignal.timeout(180000) }
    );
    assert.equal(response.status, 200);
    const bytes = Buffer.alloc(sizes[process.arch]);
    let offset = 0;
    for await (const chunk of response.body) {
      assert.ok(offset + chunk.length <= bytes.length, "Muse artifact exceeds its pinned size.");
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    assert.equal(offset, bytes.length);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hashes[process.arch]);
    await mkdir(dirname(binary), { recursive: true });
    await writeFile(binary, bytes, { mode: 0o600 });
  }
  console.log(`Verified Muse 1.3.0-R3401.1 Linux ${process.arch} artifact.`);
} else {
  const cli = resolve(process.argv[2]);
  assert.equal(
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex"),
    hashes[process.arch],
    "Use the official Muse 1.3.0-R3401.1 Linux binary matching the container architecture."
  );
  const root = await mkdtemp(join(tmpdir(), "debugbundle muse consumer "));
  const muse = join(root, "muse");
  async function run(bin, args) {
    const result = await exec(bin, args, { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
  }
  try {
    await copyFile(binary, muse);
    await chmod(muse, 0o700);
    const version = await run(muse, ["--version"]);
    assert.match(version, /1\.3\.0/u);
    await run(process.execPath, [
      cli,
      "setup",
      "--agent",
      "muse-code",
      "--non-interactive",
      "--json"
    ]);
    const validation = JSON.parse(
      await run(muse, ["skills", "validate", ".agents/skills/debugbundle", "--json"])
    );
    assert.equal(validation.valid, true);
    assert.equal(validation.id, "debugbundle");
    const list = async (trusted = true) =>
      JSON.parse(
        await run(muse, [
          "skills",
          "list",
          "--source",
          "project",
          "--workspace",
          root,
          ...(trusted ? ["--trust-workspace"] : []),
          "--json"
        ])
      );
    const assertCanonical = (catalog) => {
      assert.equal(catalog.skills.length, 1);
      assert.equal(catalog.skills[0].id, "debugbundle");
      assert.equal(catalog.skills[0].activation, "on");
      assert.equal(catalog.skills[0].path, ".agents/skills/debugbundle/SKILL.md");
      assert.deepEqual(catalog.skills[0].diagnostics, []);
    };
    const untrusted = await list(false);
    assert.equal(untrusted.skills.length, 0);
    assert.ok(untrusted.diagnostics.some((item) => item.code === "project-skills-untrusted"));
    assertCanonical(await list());
    await run(process.execPath, [
      cli,
      "setup",
      "--agent",
      "codex",
      "--agent",
      "muse-code",
      "--agent",
      "claude-code",
      "--agent",
      "gemini-cli",
      "--non-interactive",
      "--json"
    ]);
    const linked = await list();
    assertCanonical(linked);
    assert.deepEqual(linked.diagnostics, []);
    await rm(join(root, ".claude/skills/debugbundle"));
    await cp(join(root, ".agents/skills/debugbundle"), join(root, ".claude/skills/debugbundle"), {
      recursive: true
    });
    const copied = await list();
    assertCanonical(copied);
    assert.ok(
      copied.diagnostics.some(
        (item) =>
          item.code === "skill-shadowed" && item.path === ".claude/skills/debugbundle/SKILL.md"
      )
    );
    console.log(
      `${version}: canonical validation, workspace trust, linked deduplication and copied-skill precedence passed offline.`
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
