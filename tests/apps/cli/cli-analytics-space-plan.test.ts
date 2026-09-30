import { expect, it, vi } from "vitest";
import {
  createAnalyticsSpacePlanApi,
  type AnalyticsSpacePlanHttpClient
} from "../../../apps/cli/src/analytics-space-plan-api.js";
import { analyticsSpacePlanWithAuthCommand } from "../../../apps/cli/src/analytics-space-plan-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";
import { analyticsSpacePlanFixture } from "../../helpers/analytics-plan-fixtures.js";

const spaceId = "11111111-1111-4111-8111-111111111111";
const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
const sourceRevision = {
  project_id: "22222222-2222-4222-8222-222222222222",
  catalog_revision: 1
};
const record = {
  space_id: spaceId,
  revision: 1,
  space_revision: 1,
  catalog: plan.catalog,
  reports: [],
  source_catalog_revisions: [sourceRevision],
  coverage: [
    {
      name: "signup.completed",
      project_ids: [sourceRevision.project_id],
      source_entry_revisions: [{ project_id: sourceRevision.project_id, entry_revision: 1 }]
    }
  ]
};
const preview = {
  space_id: spaceId,
  preview_hash: "a".repeat(64),
  expected_revision: 0,
  resulting_revision: 1,
  space_revision: 1,
  source_catalog_revisions: [sourceRevision],
  coverage: record.coverage,
  already_applied: false
};

it("uses the bounded space-plan routes and rejects a mismatched scope or response", async () => {
  const request = vi
    .fn<AnalyticsSpacePlanHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: record })
    .mockResolvedValueOnce({ status: 200, body: { valid: true } })
    .mockResolvedValueOnce({ status: 200, body: preview })
    .mockResolvedValueOnce({ status: 200, body: { plan: record, replayed: false } });
  const api = createAnalyticsSpacePlanApi({ request });
  const bearerToken = "stored-member";
  await api.execute({ bearerToken, operation: { operation: "get", spaceId } });
  await api.execute({ bearerToken, operation: { operation: "validate", spaceId, plan } });
  await api.execute({ bearerToken, operation: { operation: "preview", spaceId, plan } });
  await api.execute({
    bearerToken,
    operation: { operation: "apply", spaceId, plan, previewHash: preview.preview_hash }
  });
  const path = `/v1/analytics/spaces/${spaceId}/plan`;
  expect(request.mock.calls.map(([input]) => input)).toEqual([
    { method: "GET", path, bearerToken },
    { method: "POST", path: `${path}/validate`, bearerToken, body: plan },
    { method: "POST", path: `${path}/preview`, bearerToken, body: plan },
    {
      method: "POST",
      path: `${path}/apply`,
      bearerToken,
      body: { plan, preview_hash: preview.preview_hash }
    }
  ]);
  await expect(
    api.execute({
      bearerToken,
      operation: {
        operation: "preview",
        spaceId,
        plan: analyticsSpacePlanFixture(sourceRevision.project_id)
      }
    })
  ).rejects.toThrow("invalid_analytics_space_plan_request");
  request.mockResolvedValueOnce({ status: 200, body: { ...record, raw: "never" } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", spaceId } })
  ).rejects.toThrow("invalid_analytics_space_plan_response");
  request.mockResolvedValueOnce({
    status: 409,
    body: { error: "analytics_space_plan_mode_unavailable" }
  });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", spaceId } })
  ).rejects.toThrow("analytics_space_plan_mode_unavailable");
});

it("routes space plan commands and requires a matching reviewed hash", async () => {
  const analyticsSpacePlanCommand = vi
    .fn<typeof analyticsSpacePlanWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  for (const operation of ["validate", "preview", "apply"] as const) {
    const args = [
      "analytics",
      "space-plan",
      operation,
      "--space",
      spaceId,
      "--plan-json",
      JSON.stringify(plan)
    ];
    if (operation === "apply") args.push("--preview-hash", preview.preview_hash);
    expect((await runCli(args, { analyticsSpacePlanCommand })).exitCode).toBe(0);
  }
  expect(
    (
      await runCli(["analytics", "space-plan", "get", "--space", spaceId], {
        analyticsSpacePlanCommand
      })
    ).exitCode
  ).toBe(0);
  expect(analyticsSpacePlanCommand).toHaveBeenCalledTimes(4);
  expect(
    (
      await runCli(
        [
          "analytics",
          "space-plan",
          "apply",
          "--space",
          spaceId,
          "--plan-json",
          JSON.stringify(plan)
        ],
        { analyticsSpacePlanCommand }
      )
    ).exitCode
  ).toBe(4);
});
