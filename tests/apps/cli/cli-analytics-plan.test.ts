import { expect, it, vi } from "vitest";
import {
  createAnalyticsPlanApi,
  type AnalyticsPlanHttpClient
} from "../../../apps/cli/src/analytics-plan-api.js";
import { analyticsPlanWithAuthCommand } from "../../../apps/cli/src/analytics-plan-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";
import {
  analyticsProjectPlanFixture,
  analyticsProjectPlanPreviewFixture,
  analyticsProjectPlanRecordFixture
} from "../../helpers/analytics-plan-fixtures.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const plan = analyticsProjectPlanFixture(projectId);
const preview = analyticsProjectPlanPreviewFixture(projectId);
const record = analyticsProjectPlanRecordFixture(projectId);

it("uses the same plan routes with strict response parsing and bounded remote errors", async () => {
  const request = vi
    .fn<AnalyticsPlanHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: record })
    .mockResolvedValueOnce({ status: 200, body: { valid: true } })
    .mockResolvedValueOnce({ status: 200, body: preview })
    .mockResolvedValueOnce({ status: 200, body: { plan: record, replayed: false } });
  const api = createAnalyticsPlanApi({ request });
  const bearerToken = "stored-member";
  expect(await api.execute({ bearerToken, operation: { operation: "get", projectId } })).toEqual(
    record
  );
  expect(
    await api.execute({ bearerToken, operation: { operation: "validate", projectId, plan } })
  ).toEqual({ valid: true });
  expect(
    await api.execute({ bearerToken, operation: { operation: "preview", projectId, plan } })
  ).toEqual(preview);
  expect(
    await api.execute({
      bearerToken,
      operation: { operation: "apply", projectId, plan, previewHash: preview.preview_hash }
    })
  ).toEqual({ plan: record, replayed: false });
  const path = `/v1/projects/${projectId}/analytics/plan`;
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
  request.mockResolvedValueOnce({
    status: 200,
    body: {
      ...record,
      observations: [
        {
          event_name: "signup.completed",
          event_revision: 1,
          producer_kind: "server",
          observed_count: "-1",
          first_observed_on: "2026-09-29",
          last_observed_on: "2026-09-29"
        }
      ]
    }
  });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", projectId } })
  ).rejects.toThrow("invalid_analytics_plan_response");
  request.mockResolvedValueOnce({
    status: 200,
    body: { plan: record, replayed: false, raw: "never" }
  });
  await expect(
    api.execute({
      bearerToken,
      operation: { operation: "apply", projectId, plan, previewHash: preview.preview_hash }
    })
  ).rejects.toThrow("invalid_analytics_plan_response");
  request.mockResolvedValueOnce({ status: 409, body: { error: "analytics_plan_conflict" } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", projectId } })
  ).rejects.toThrow("analytics_plan_conflict");
  request.mockResolvedValueOnce({ status: 500, body: { error: "customer.secret" } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", projectId } })
  ).rejects.toThrow("analytics_plan_request_failed");
});

it("routes get, validate, preview and reviewed apply before authentication", async () => {
  const analyticsPlanCommand = vi
    .fn<typeof analyticsPlanWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  for (const operation of ["validate", "preview", "apply"] as const) {
    const args = [
      "analytics",
      "plan",
      operation,
      "--project",
      projectId,
      "--plan-json",
      JSON.stringify(plan)
    ];
    if (operation === "apply") args.push("--preview-hash", preview.preview_hash);
    expect((await runCli(args, { analyticsPlanCommand })).exitCode).toBe(0);
  }
  expect(
    (await runCli(["analytics", "plan", "get", "--project", projectId], { analyticsPlanCommand }))
      .exitCode
  ).toBe(0);
  expect(analyticsPlanCommand.mock.calls.map(([input]) => input.operation)).toEqual([
    { operation: "validate", projectId, plan },
    { operation: "preview", projectId, plan },
    { operation: "apply", projectId, plan, previewHash: preview.preview_hash },
    { operation: "get", projectId }
  ]);
  expect(
    (
      await runCli(
        ["analytics", "plan", "apply", "--project", projectId, "--plan-json", JSON.stringify(plan)],
        { analyticsPlanCommand }
      )
    ).exitCode
  ).toBe(4);
  expect(analyticsPlanCommand).toHaveBeenCalledTimes(4);
});

it("renders bounded plan summaries and preserves authentication and conflict exit codes", async () => {
  const readAuthState = vi
    .fn()
    .mockResolvedValue({ bearer_token: "stored-member", base_url: "https://api.example.test" });
  const fetchImpl = vi.fn<typeof fetch>();
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  fetchImpl.mockResolvedValueOnce(response(preview));
  const reviewed = await analyticsPlanWithAuthCommand(
    { operation: { operation: "preview", projectId, plan } },
    { readAuthState, fetchImpl }
  );
  expect(reviewed.exitCode).toBe(0);
  expect(reviewed.output).toContain(preview.preview_hash);
  expect(reviewed.output).not.toContain("Confirmed signup");
  fetchImpl.mockResolvedValueOnce(
    response({
      ...record,
      observations: [
        {
          event_name: "signup.completed",
          event_revision: 1,
          producer_kind: "server",
          observed_count: "2",
          first_observed_on: "2026-09-29",
          last_observed_on: "2026-09-29"
        }
      ]
    })
  );
  const discovered = await analyticsPlanWithAuthCommand(
    { operation: { operation: "get", projectId } },
    { readAuthState, fetchImpl }
  );
  expect(discovered.output).toContain("observed_producers: 1");
  fetchImpl.mockResolvedValueOnce(response({ error: "analytics_plan_conflict" }, 409));
  expect(
    await analyticsPlanWithAuthCommand(
      { operation: { operation: "apply", projectId, plan, previewHash: preview.preview_hash } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 4, output: "analytics_plan_conflict" });
  expect(
    (
      await analyticsPlanWithAuthCommand(
        { operation: { operation: "get", projectId: "invalid" } },
        { readAuthState, fetchImpl }
      )
    ).exitCode
  ).toBe(4);
});
