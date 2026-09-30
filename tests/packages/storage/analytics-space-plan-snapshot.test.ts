import { expect, it, vi } from "vitest";
import { loadSpacePlanCatalogSnapshot } from "../../../packages/storage/src/analytics-space-plan-snapshot.js";
import type { AnalyticsProjectCatalogRecord } from "../../../packages/storage/src/analytics-project-catalog-store.js";
import { analyticsSpacePlanFixture } from "../../helpers/analytics-plan-fixtures.js";

const spaceId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const sourceA = "55555555-5555-4555-8555-555555555555";
const sourceB = "66666666-6666-4666-8666-666666666666";
const plan = analyticsSpacePlanFixture(spaceId);
const space = {
  id: spaceId,
  organization_id: organizationId,
  display_name: "Growth",
  mode: "connected" as const,
  revision: 4,
  project_ids: [sourceA, sourceB],
  created_at: "2026-09-28T00:00:00.000Z",
  archived: false
};

function dependencies() {
  const readSpace = vi.fn().mockResolvedValue(space);
  const authorizeSnapshot = vi.fn().mockResolvedValue(true);
  const readCatalog = vi.fn(
    async ({
      projectId
    }: {
      projectId: string;
    }): Promise<AnalyticsProjectCatalogRecord | null> => ({
      project_id: projectId,
      revision: 1,
      catalog_revision: projectId === sourceA ? 5 : 8,
      entries: projectId === sourceA ? plan.catalog : []
    })
  );
  return {
    spaces: { read: readSpace, authorizeSnapshot },
    catalogs: { read: readCatalog },
    readSpace,
    authorizeSnapshot,
    readCatalog
  };
}

it("loads every current authorized source and retains partial entry coverage", async () => {
  const deps = dependencies();
  const result = await loadSpacePlanCatalogSnapshot({
    actorUserId,
    spaceId,
    plan,
    spaces: deps.spaces,
    catalogs: deps.catalogs
  });

  expect(result).toEqual({
    ok: true,
    space_revision: 4,
    source_catalog_revisions: [
      { project_id: sourceA, catalog_revision: 5 },
      { project_id: sourceB, catalog_revision: 8 }
    ],
    coverage: [
      {
        name: "signup.completed",
        project_ids: [sourceA],
        source_entry_revisions: [{ project_id: sourceA, entry_revision: 1 }]
      }
    ]
  });
  expect(deps.readCatalog).toHaveBeenCalledTimes(2);
  expect(deps.authorizeSnapshot).toHaveBeenCalledWith({
    actorUserId,
    spaceId,
    revision: 4,
    sourceProjectIds: [sourceA, sourceB]
  });
});

it("fails closed when one source catalog is absent or inaccessible", async () => {
  const deps = dependencies();
  deps.readCatalog.mockImplementation(async ({ projectId }) =>
    projectId === sourceB
      ? null
      : { project_id: sourceA, revision: 1, catalog_revision: 5, entries: plan.catalog }
  );
  expect(
    await loadSpacePlanCatalogSnapshot({
      actorUserId,
      spaceId,
      plan,
      spaces: deps.spaces,
      catalogs: deps.catalogs
    })
  ).toEqual({ ok: false, reason: "source_unavailable" });
  expect(deps.authorizeSnapshot).not.toHaveBeenCalled();
});

it("rejects a changed space membership and same-name source semantic conflict", async () => {
  const deps = dependencies();
  deps.authorizeSnapshot.mockResolvedValueOnce(false);
  expect(
    await loadSpacePlanCatalogSnapshot({
      actorUserId,
      spaceId,
      plan,
      spaces: deps.spaces,
      catalogs: deps.catalogs
    })
  ).toEqual({ ok: false, reason: "stale_space" });

  deps.readCatalog.mockImplementation(async ({ projectId }) => ({
    project_id: projectId,
    revision: 1,
    catalog_revision: 5,
    entries:
      projectId === sourceA
        ? plan.catalog
        : [
            {
              ...plan.catalog[0]!,
              properties: { tier: { type: "boolean" as const, required: false } }
            }
          ]
  }));
  expect(
    await loadSpacePlanCatalogSnapshot({
      actorUserId,
      spaceId,
      plan,
      spaces: deps.spaces,
      catalogs: deps.catalogs
    })
  ).toEqual({ ok: false, reason: "catalog_semantic_conflict" });
});

it("rejects invalid target scope and unavailable spaces before reading catalogs", async () => {
  const deps = dependencies();
  expect(
    await loadSpacePlanCatalogSnapshot({
      actorUserId,
      spaceId,
      plan: { ...plan, scope: { kind: "project", project_id: sourceA } },
      spaces: deps.spaces,
      catalogs: deps.catalogs
    })
  ).toEqual({ ok: false, reason: "invalid_plan" });
  expect(deps.readSpace).not.toHaveBeenCalled();

  deps.readSpace.mockResolvedValueOnce({ ...space, archived: true });
  expect(
    await loadSpacePlanCatalogSnapshot({
      actorUserId,
      spaceId,
      plan,
      spaces: deps.spaces,
      catalogs: deps.catalogs
    })
  ).toEqual({ ok: false, reason: "space_unavailable" });
  expect(deps.readCatalog).not.toHaveBeenCalled();
});
