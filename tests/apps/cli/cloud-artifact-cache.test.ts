import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cacheCloudBundleArtifact,
  cacheCloudReproductionArtifact,
  pruneCloudArtifactCache,
  syncCloudIncidentCacheStatus
} from "../../../apps/cli/src/cloud-artifact-cache.js";

const roots: string[] = [];
async function fixture(): Promise<{ workspace: string; outside: string }> {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-cache-safety-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  return { workspace, outside };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("cloud artifact cache boundaries", () => {
  it.each([
    "../escape",
    "inc#../../../../../escape",
    "a/b",
    "a\\b",
    "%2e%2e%2fescape",
    "a?b",
    "..",
    "",
    "a\n",
    "a".repeat(256)
  ])("rejects unsafe incident ID %j before cache side effects", async (incidentId) => {
    const readdir = vi.fn().mockResolvedValue([]);
    const writeFile = vi.fn();
    const mkdir = vi.fn();
    const dependencies = { cwd: () => "/tmp/cache-fixture", readdir, writeFile, mkdir };
    await expect(
      cacheCloudBundleArtifact({ incidentId, bundle: {} }, dependencies)
    ).rejects.toMatchObject({ code: "invalid_incident_id" });
    await expect(
      cacheCloudReproductionArtifact({ incidentId, reproduction: {} }, dependencies)
    ).rejects.toMatchObject({ code: "invalid_incident_id" });
    await expect(
      syncCloudIncidentCacheStatus({ incidentId, incident: { status: "resolved" } }, dependencies)
    ).rejects.toMatchObject({ code: "invalid_incident_id" });
    expect(readdir).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not escape the workspace through a fragment-bearing incident ID", async () => {
    const { workspace } = await fixture();
    const incidentId = "inc#../../../../../escape";
    await expect(
      cacheCloudBundleArtifact(
        { incidentId, bundle: { incident_id: incidentId } },
        { cwd: () => workspace }
      )
    ).rejects.toMatchObject({ code: "invalid_incident_id" });
    await expect(readFile(join(workspace, "..", "escape.bundle.json"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects a symlinked cache directory before pruning or writing outside it", async () => {
    const { workspace, outside } = await fixture();
    await mkdir(join(workspace, ".debugbundle/bundles"), { recursive: true });
    await symlink(outside, join(workspace, ".debugbundle/bundles/cloud"), "dir");
    const marker = join(outside, "keep.bundle.json");
    await writeFile(marker, "preserved");
    await expect(
      pruneCloudArtifactCache({ olderThanMs: -1 }, { cwd: () => workspace })
    ).rejects.toThrow(/symbolic link/);
    await expect(
      cacheCloudBundleArtifact({ incidentId: "inc_valid", bundle: {} }, { cwd: () => workspace })
    ).rejects.toThrow(/symbolic link/);
    expect(await readFile(marker, "utf8")).toBe("preserved");
    await expect(readFile(join(outside, "inc_valid.bundle.json"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it.each(["bundle", "reproduction"])("rejects a symlinked %s destination", async (kind) => {
    const { workspace, outside } = await fixture();
    const cache = join(
      workspace,
      ".debugbundle/bundles/cloud",
      kind === "reproduction" ? "reproductions" : ""
    );
    await mkdir(cache, { recursive: true });
    const marker = join(outside, "preserve.json");
    await writeFile(marker, "preserved");
    await symlink(marker, join(cache, `inc_valid.${kind}.json`));
    const run =
      kind === "bundle"
        ? cacheCloudBundleArtifact(
            { incidentId: "inc_valid", bundle: {} },
            { cwd: () => workspace }
          )
        : cacheCloudReproductionArtifact(
            { incidentId: "inc_valid", reproduction: {} },
            { cwd: () => workspace }
          );
    await expect(run).rejects.toThrow(/symbolic link/);
    expect(await readFile(marker, "utf8")).toBe("preserved");
  });

  it("preserves unknown files during cache retention", async () => {
    const { workspace } = await fixture();
    const cache = join(workspace, ".debugbundle/bundles/cloud");
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "owner-notes.txt"), "preserved");
    await writeFile(join(cache, "inc_old.bundle.json"), "{}");
    const result = await pruneCloudArtifactCache({ olderThanMs: -1 }, { cwd: () => workspace });
    expect(result.removed).toBe(1);
    expect(await readFile(join(cache, "owner-notes.txt"), "utf8")).toBe("preserved");
  });

  it("retains safe opaque IDs and normal bundle, reproduction and lifecycle caching", async () => {
    const { workspace } = await fixture();
    const dependencies = { cwd: () => workspace };
    await cacheCloudBundleArtifact(
      { incidentId: "inc_legacy-1.v2", bundle: { incident_id: "inc_legacy-1.v2", status: "open" } },
      dependencies
    );
    await cacheCloudReproductionArtifact(
      { incidentId: "inc_legacy-1.v2", reproduction: { possible: false } },
      dependencies
    );
    await syncCloudIncidentCacheStatus(
      { incidentId: "inc_legacy-1.v2", incident: { status: "resolved" } },
      dependencies
    );
    const bundle = JSON.parse(
      await readFile(
        join(workspace, ".debugbundle/bundles/cloud/inc_legacy-1.v2.bundle.json"),
        "utf8"
      )
    );
    expect(bundle.status).toBe("resolved");
    expect(bundle.source).toBe("cloud");
    const reproduction = JSON.parse(
      await readFile(
        join(
          workspace,
          ".debugbundle/bundles/cloud/reproductions/inc_legacy-1.v2.reproduction.json"
        ),
        "utf8"
      )
    );
    expect(reproduction.possible).toBe(false);
    expect(reproduction.source).toBe("cloud");
  });
});
