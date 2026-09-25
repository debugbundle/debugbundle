import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const temporaryRoots: string[] = [];

async function candidate() {
  const directory = await mkdtemp(join(tmpdir(), "gemini-package-"));
  temporaryRoots.push(directory);
  const source = join(directory, "plugins/debugbundle-gemini");
  await mkdir(join(directory, "plugins"));
  await cp(join(root, "plugins/debugbundle-gemini"), source, { recursive: true });
  const manifestPath = join(source, "gemini-extension.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const build = () =>
    execFileSync(process.execPath, [join(root, "scripts/package-gemini-extension.mjs")], {
      cwd: directory,
      encoding: "utf8",
      stdio: "pipe"
    });
  const archive = join(
    directory,
    `.tmp/gemini-extension/debugbundle-gemini-${manifest.version}.zip`
  );
  return { directory, source, manifestPath, manifest, build, archive };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Gemini extension release archive", () => {
  it("is reproducible and includes only the standalone extension files", async () => {
    const fixture = await candidate();
    await writeFile(join(fixture.source, ".env"), "SYNTHETIC_SECRET=must-not-ship\n");
    fixture.build();
    const first = await readFile(fixture.archive);
    fixture.build();
    expect(await readFile(fixture.archive)).toEqual(first);
    const extracted = join(fixture.directory, "extracted");
    execFileSync("unzip", ["-q", fixture.archive, "-d", extracted]);
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(extracted)).sort()).toEqual([
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "gemini-extension.json",
      "skills"
    ]);
    expect(JSON.parse(await readFile(join(extracted, "gemini-extension.json"), "utf8"))).toEqual(
      fixture.manifest
    );
    expect(await readFile(join(extracted, "skills/debugbundle/SKILL.md"), "utf8")).toBe(
      await readFile(join(fixture.source, "skills/debugbundle/SKILL.md"), "utf8")
    );
    expect(first.includes(Buffer.from("must-not-ship"))).toBe(false);
  });

  it.each(["server", "credentials", "context", "version", "pin"])(
    "rejects unsupported %s changes before creating an archive",
    async (change) => {
      const fixture = await candidate();
      if (change === "server") fixture.manifest.mcpServers.extra = { command: "other-server" };
      if (change === "credentials")
        fixture.manifest.mcpServers.debugbundle.env = { DEBUGBUNDLE_MEMBER_TOKEN: "synthetic" };
      if (change === "context") fixture.manifest.contextFileName = "../GEMINI.md";
      if (change === "version") fixture.manifest.version = "01.0.0";
      if (change === "pin")
        fixture.manifest.mcpServers.debugbundle.args[1] = "@debugbundle/mcp@latest";
      await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
      expect(fixture.build).toThrow();
    }
  );

  it("rejects symlinks instead of packaging files outside the reviewed source", async () => {
    const fixture = await candidate();
    const external = join(fixture.directory, "external.md");
    await writeFile(external, "SYNTHETIC_OUTSIDE_FILE");
    await rm(join(fixture.source, "README.md"));
    await symlink(external, join(fixture.source, "README.md"));
    expect(fixture.build).toThrow();
  });
});
