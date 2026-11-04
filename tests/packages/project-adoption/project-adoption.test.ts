import { writeFile, readFile, rm, stat, symlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  previewProjectAdoption,
  applyProjectAdoption
} from "../../../packages/project-adoption/src/index.js";
import { createProjectAdoptionFixture } from "../../helpers/project-adoption-fixture.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const value = await createProjectAdoptionFixture();
  roots.push(value.root);
  return value;
}

it("previews only recognised context changes and applies without changing local names or custom data", async () => {
  const f = await fixture(),
    before = await readFile(f.profilePath, "utf8");
  const plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  expect(await readFile(f.profilePath, "utf8")).toBe(before);
  expect(JSON.stringify(plan)).not.toContain(f.profile.custom_secret);
  expect(plan.files.map((file) => file.path).sort()).toEqual([
    ".debugbundle/local/connection.json",
    ".debugbundle/profile.json"
  ]);
  const result = await applyProjectAdoption({ plan, operation: f.operation });
  expect(result).toMatchObject({
    local_adoption: "pending_repository_checks",
    deployed_runtime: "pending"
  });
  expect(JSON.parse(await readFile(f.connectionPath, "utf8"))).toMatchObject({
    cloud_project_id: f.target
  });
  const profile = JSON.parse(await readFile(f.profilePath, "utf8"));
  expect(profile).toMatchObject({
    custom_secret: f.profile.custom_secret,
    services: [
      {
        name: "web",
        custom: { keep: "custom value" },
        debugbundle: {
          service_definition_id: f.definition,
          canonical_name: "Site",
          runtime_input_name: "web"
        }
      }
    ]
  });
  expect((await stat(f.profilePath)).mode & 0o777).toBe(0o640);
  expect(await readFile(join(f.root, ".debugbundle/local/state.json"), "utf8")).toBe(
    "retained-local-state"
  );
  await expect(applyProjectAdoption({ plan, operation: f.operation })).resolves.toMatchObject({
    local_adoption: "pending_repository_checks"
  });
  expect(
    (await previewProjectAdoption({ workspace_root: f.root, operation: f.operation })).files.every(
      (file) => file.changes.length === 0
    )
  ).toBe(true);
  // Re-running the checked plan completes a process interruption between files.
  await writeFile(f.profilePath, before);
  await expect(applyProjectAdoption({ plan, operation: f.operation })).resolves.toMatchObject({
    local_adoption: "pending_repository_checks"
  });
});
it("rejects unrelated workspaces, unsafe hierarchies and changed files before writing", async () => {
  const f = await fixture();
  const plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  await writeFile(f.profilePath, (await readFile(f.profilePath, "utf8")) + " ");
  await expect(applyProjectAdoption({ plan, operation: f.operation })).rejects.toThrow(
    "adoption_file_changed"
  );
  expect(JSON.parse(await readFile(f.connectionPath, "utf8")).cloud_project_id).toBe(f.source);
  await rename(join(f.root, ".debugbundle/local"), join(f.root, "retained-local"));
  await symlink(join(f.root, "retained-local"), join(f.root, ".debugbundle/local"));
  await expect(
    previewProjectAdoption({ workspace_root: f.root, operation: f.operation })
  ).rejects.toThrow("adoption_unsafe_path");
});
it("rejects an incomplete server gate and stale nested-merge manifest", async () => {
  const f = await fixture();
  await expect(
    previewProjectAdoption({
      workspace_root: f.root,
      operation: { ...f.operation, state: "verification_failed_after_commit" }
    })
  ).rejects.toThrow("adoption_server_not_verified");
  await expect(
    previewProjectAdoption({
      workspace_root: f.root,
      operation: { ...f.operation, canonical_project_id: randomUUID() }
    })
  ).rejects.toThrow("adoption_manifest_stale");
});
it("does not accept a forged no-op plan as successful adoption", async () => {
  const f = await fixture(),
    plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  const altered = {
    ...plan,
    files: plan.files.map((file) => ({ ...file, after_sha256: file.before_sha256, changes: [] }))
  };
  const body = { ...altered };
  Reflect.deleteProperty(body, "plan_digest");
  altered.plan_digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  await expect(applyProjectAdoption({ plan: altered, operation: f.operation })).rejects.toThrow(
    "adoption_invalid_plan"
  );
});
it("rolls back its own first write when the next atomic replacement fails", async () => {
  const f = await fixture(),
    original = await readFile(f.connectionPath, "utf8"),
    plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  await expect(
    applyProjectAdoption(
      { plan, operation: f.operation },
      {
        beforeReplace: async (_path, index) => {
          if (index === 1) throw new Error("simulated_failure");
        }
      }
    )
  ).rejects.toThrow("adoption_apply_failed");
  expect(await readFile(f.connectionPath, "utf8")).toBe(original);
});

it("preserves another adoption lock and rejects overlapping work before edits", async () => {
  const f = await fixture(),
    plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  const lock = join(f.root, ".debugbundle/adoption.lock"),
    original = await readFile(f.connectionPath, "utf8");
  await writeFile(lock, "another-operation", { mode: 0o600 });
  await expect(applyProjectAdoption({ plan, operation: f.operation })).rejects.toThrow(
    "adoption_already_running"
  );
  expect(await readFile(lock, "utf8")).toBe("another-operation");
  expect(await readFile(f.connectionPath, "utf8")).toBe(original);
});

it("adopts a monorepo's service subset and leaves remote-only services out of its profile", async () => {
  const f = await fixture(),
    manifest = f.operation.receipt!.adoption_manifest!,
    apiId = randomUUID();
  const original = manifest.services[0]!;
  const api = {
    ...original,
    service_definition_id: apiId,
    name: "API",
    input_name: "api",
    retained_input_names: ["api"],
    repository_root: "apps/api",
    repository: { url: original.repository!.url, root: "apps/api", source: "service" as const }
  };
  manifest.services.push(api, {
    ...original,
    service_definition_id: randomUUID(),
    origin_project_id: f.target,
    name: "Worker",
    input_name: "worker",
    retained_input_names: ["worker"]
  });
  const mapping = { source_project_id: f.source, service_definition_id: apiId, name: "API" };
  f.operation.request.service_mappings.push(mapping);
  f.operation.receipt!.service_mappings.push(mapping);
  await writeFile(
    f.profilePath,
    JSON.stringify({
      ...f.profile,
      services: [
        ...f.profile.services,
        { ...f.profile.services[0]!, name: "api", kind: "backend", paths: ["apps/api"] }
      ]
    })
  );
  const plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  await applyProjectAdoption({ plan, operation: f.operation });
  const result = JSON.parse(await readFile(f.profilePath, "utf8")) as {
    services: Array<{
      name: string;
      debugbundle: { service_definition_id: string; repository_root: string | null };
    }>;
  };
  expect(result.services.map((service) => service.name)).toEqual(["web", "api"]);
  expect(result.services[1]!.debugbundle).toMatchObject({
    service_definition_id: apiId,
    repository_root: "apps/api"
  });
  expect(manifest.services).toHaveLength(3);
});

it("rejects an unrelated repository before generating an adoption plan", async () => {
  const f = await fixture();
  const connection = JSON.parse(await readFile(f.connectionPath, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    f.connectionPath,
    JSON.stringify({ ...connection, cloud_project_id: randomUUID() })
  );
  await expect(
    previewProjectAdoption({ workspace_root: f.root, operation: f.operation })
  ).rejects.toThrow("adoption_workspace_not_in_merge");
});

it("does not remove a replacement lock when ownership changes during adoption", async () => {
  const f = await fixture(),
    plan = await previewProjectAdoption({ workspace_root: f.root, operation: f.operation });
  const lock = join(f.root, ".debugbundle/adoption.lock");
  await expect(
    applyProjectAdoption(
      { plan, operation: f.operation },
      {
        beforeReplace: async (_path, index) => {
          if (index !== 0) return;
          await rename(lock, join(f.root, ".debugbundle/retained-adoption.lock"));
          await writeFile(lock, "replacement-operation", { mode: 0o600 });
        }
      }
    )
  ).rejects.toThrow("adoption_lock_changed_review_required");
  expect(await readFile(lock, "utf8")).toBe("replacement-operation");
});
