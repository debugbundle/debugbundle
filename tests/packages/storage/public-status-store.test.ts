import { expect, it, vi } from "vitest";
import { createPublicStatusPageStore } from "../../../packages/storage/src/public-status-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import {
  statusCheckId,
  statusProjectId,
  statusPublicId,
  statusSettings
} from "../../helpers/public-status.ts";
const scope = {
  project_id: statusProjectId,
  organization_id: "00000000-0000-4000-8000-000000000010",
  owner_user_id: "00000000-0000-4000-8000-000000000020"
};
const page = { id: "page-id", public_id: statusPublicId, title: "Saved title", enabled: true };
function setup(
  options: {
    missingOwner?: boolean;
    page?: typeof page | null;
    selections?: unknown[];
    invalidProject?: boolean;
    invalidCheck?: boolean;
    mismatchedCheck?: boolean;
    conflict?: boolean;
    source?: unknown[];
    choices?: unknown[];
  } = {}
) {
  const query = vi.fn(async (sql: string, _params: unknown[]) => {
    void _params;
    if (sql.startsWith("WITH page")) return { rows: options.source ?? [] };
    if (sql.startsWith("SELECT name FROM projects"))
      return { rows: options.missingOwner ? [] : [{ name: "Website" }] };
    if (sql.startsWith("SELECT id::text,public_id"))
      return { rows: options.page === null ? [] : [options.page ?? page] };
    if (sql.startsWith("SELECT pp.project_id"))
      return { rows: options.selections ?? statusSettings.projects };
    if (sql.startsWith("SELECT id::text AS project_id"))
      return { rows: options.invalidProject ? [] : [{ project_id: scope.project_id }] };
    if (sql.startsWith("SELECT id::text AS check_id"))
      return {
        rows: options.invalidCheck
          ? []
          : [
              {
                check_id: statusCheckId,
                project_id: options.mismatchedCheck ? "other-project" : scope.project_id
              }
            ]
      };
    if (sql.startsWith("INSERT INTO public_status_pages"))
      return { rows: options.conflict ? [] : [page] };
    if (sql.startsWith("SELECT p.id::text")) return { rows: options.choices ?? [] };
    if (sql.startsWith("DELETE") || sql.startsWith("INSERT INTO public_status_page_"))
      return { rows: [] };
    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const db: Queryable = { query: query as Queryable["query"], transaction: (work) => work(db) };
  return { store: createPublicStatusPageStore(db), query };
}
it("reads private-by-default and saved settings while retaining an empty anchor", async () => {
  expect(await setup({ page: null }).store.getSettings(scope)).toEqual({
    public_id: null,
    settings: {
      title: "Website status",
      enabled: false,
      projects: [{ project_id: scope.project_id, check_ids: [] }]
    }
  });
  expect((await setup().store.getSettings(scope)).public_id).toBe(statusPublicId);
  expect((await setup({ selections: [] }).store.getSettings(scope)).settings.projects).toEqual([
    { project_id: scope.project_id, check_ids: [] }
  ]);
  await expect(setup({ missingOwner: true }).store.getSettings(scope)).rejects.toThrow("not_found");
});
it("sanitizes a new public title before persistence", async () => {
  const secret = "dbundle_mem_" + "b".repeat(48);
  const { store, query } = setup();
  await store.saveSettings(scope, { ...statusSettings, title: `token=${secret}` });
  const insert = query.mock.calls.find(([sql]) =>
    sql.startsWith("INSERT INTO public_status_pages")
  );
  expect(String(insert?.[1][5])).not.toContain(secret);
});
it("validates owner and every selection before replacement and preserves a conflict failure", async () => {
  for (const options of [
    { missingOwner: true },
    { invalidProject: true },
    { invalidCheck: true },
    { mismatchedCheck: true },
    { conflict: true }
  ]) {
    const { store, query } = setup(options);
    await expect(store.saveSettings(scope, statusSettings)).rejects.toThrow();
    expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(false);
  }
  await expect(
    setup().store.saveSettings(scope, {
      ...statusSettings,
      projects: [{ project_id: scope.organization_id, check_ids: [statusCheckId] }]
    })
  ).rejects.toThrow("invalid_selection");
  await expect(
    setup().store.saveSettings(scope, {
      ...statusSettings,
      projects: [{ project_id: scope.project_id, check_ids: [] }]
    })
  ).rejects.toThrow("invalid_selection");
  const { store, query } = setup();
  expect((await store.saveSettings(scope, statusSettings)).public_id).toBe(statusPublicId);
  expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(true);
});
it("bounds both option dimensions and returns explicit cursors", async () => {
  const choices = Array.from({ length: 51 }, (_, i) => ({
    project_id: `project-${i}`,
    name: "Choice",
    checks: Array.from({ length: 51 }, (_, j) => ({ check_id: `check-${j}`, name: "Check" }))
  }));
  const { store, query } = setup({ choices });
  const result = await store.listOptions(scope, { cursor: scope.project_id });
  expect(result.projects).toHaveLength(50);
  expect(result.next_cursor).toBe("project-49");
  expect(result.projects[0]?.checks).toHaveLength(50);
  expect(result.projects[0]?.next_check_cursor).toBe("check-49");
  expect(query.mock.lastCall?.[1]).toEqual([
    scope.organization_id,
    scope.owner_user_id,
    scope.project_id,
    null,
    null
  ]);
  expect(
    (
      await setup({
        choices: [{ project_id: scope.project_id, name: "Empty", checks: [] }]
      }).store.listOptions(scope)
    ).projects[0]?.next_check_cursor
  ).toBeNull();
  await expect(
    setup().store.listOptions(scope, {
      check_project_id: scope.project_id,
      check_cursor: statusCheckId
    })
  ).rejects.toThrow("invalid_selection");
});
it("projects only server-selected rows and handles missing/empty publication and preview", async () => {
  const row = {
    title: "Public",
    project_id: scope.project_id,
    project_name: "Website",
    check_id: statusCheckId,
    name: "Service",
    enabled: true,
    base_status: "passing",
    within_plan_limit: true,
    within_monitored_project_limit: true,
    within_organization_active_limit: true,
    interval_seconds: 60,
    failure_threshold: 3,
    organization_plan: "team",
    rollups: []
  };
  const { store, query } = setup({
    source: [row, { ...row, check_id: "second-check" }, { title: "Public", project_id: null }]
  });
  const view = await store.getPublicPage(statusPublicId);
  expect(view?.projects[0]?.checks).toHaveLength(2);
  expect(view?.projects[0]?.current_state).toBe("unknown");
  expect(query.mock.lastCall?.[1]).toEqual([statusPublicId, null, null]);
  expect(await store.preview(scope)).toEqual(view);
  expect(query.mock.lastCall?.[1]).toEqual([
    scope.project_id,
    scope.owner_user_id,
    scope.organization_id
  ]);
  expect(await setup().store.getPublicPage(statusPublicId)).toBeNull();
  expect(
    (
      await setup({ source: [{ title: "Public", project_id: null }] }).store.getPublicPage(
        statusPublicId
      )
    )?.projects
  ).toEqual([]);
});
