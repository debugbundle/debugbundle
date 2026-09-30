import { expect, it, vi } from "vitest";
import {
  createAnalyticsReportApi,
  type AnalyticsReportHttpClient
} from "../../../apps/cli/src/analytics-report-api.js";
import { analyticsReportWithAuthCommand } from "../../../apps/cli/src/analytics-report-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const query = {
  projectId,
  reportKey: "signup_funnel",
  from: "2026-09-28T00:00:00.000Z",
  to: "2026-09-29T00:00:00.000Z"
};
const response = {
  kind: "report" as const,
  report: { status: "unavailable" as const, reason: "insufficient_history" as const },
  evidence: {
    pending_events: "0",
    failed_events: "0",
    lost_events: "0",
    excluded_events: "0",
    erasure_tasks: "0",
    source_coverage: "unverified" as const
  }
};

it("sends one bounded project query and validates response and remote error shapes", async () => {
  const request = vi
    .fn<AnalyticsReportHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: response })
    .mockResolvedValueOnce({ status: 200, body: { ...response, secret: "unexpected" } })
    .mockResolvedValueOnce({ status: 503, body: { error: "customer.secret" } });
  const api = createAnalyticsReportApi({ request });
  expect(await api.execute({ bearerToken: "member", query })).toEqual(response);
  expect(request).toHaveBeenCalledWith({
    method: "POST",
    path: `/v1/analytics/scopes/project/${projectId}/reports/query`,
    bearerToken: "member",
    body: { report_key: query.reportKey, from: query.from, to: query.to }
  });
  await expect(api.execute({ bearerToken: "member", query })).rejects.toThrow(
    "invalid_analytics_report_response"
  );
  await expect(api.execute({ bearerToken: "member", query })).rejects.toThrow(
    "analytics_report_request_failed"
  );
  expect(request).toHaveBeenCalledTimes(3);
  await expect(
    api.execute({ bearerToken: "member", query: { ...query, to: query.from } })
  ).rejects.toThrow("invalid_analytics_report_request");
  expect(request).toHaveBeenCalledTimes(3);
});

it("routes the project command and prints only bounded report metadata", async () => {
  const analyticsReportCommand = vi
    .fn<typeof analyticsReportWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  const args = [
    "analytics",
    "reports",
    "query",
    "--project",
    projectId,
    "--report-key",
    query.reportKey,
    "--from",
    query.from,
    "--to",
    query.to
  ];
  expect((await runCli(args, { analyticsReportCommand })).exitCode).toBe(0);
  expect(analyticsReportCommand).toHaveBeenCalledWith({ query });
  expect((await runCli([...args, "--unknown", "x"], { analyticsReportCommand })).exitCode).toBe(4);
  const readAuthState = vi.fn().mockResolvedValue({
    bearer_token: "member",
    base_url: "https://api.example.test"
  });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  const output = await analyticsReportWithAuthCommand({ query }, { readAuthState, fetchImpl });
  expect(output).toEqual({
    exitCode: 0,
    output:
      "report: unavailable (insufficient_history)\nsource_coverage: unverified\nfailed_events: 0\nexcluded_events: 0\nerasure_tasks: 0"
  });
});

it("offers the same server-clock recent window without mixing absolute dates", async () => {
  const recent = { projectId, reportKey: query.reportKey, last: "7d" as const };
  const request = vi.fn<AnalyticsReportHttpClient["request"]>().mockResolvedValue({
    status: 200,
    body: response
  });
  expect(
    await createAnalyticsReportApi({ request }).execute({ bearerToken: "member", query: recent })
  ).toEqual(response);
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ body: { report_key: query.reportKey, last: "7d" } })
  );
  const analyticsReportCommand = vi
    .fn<typeof analyticsReportWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  const args = [
    "analytics",
    "reports",
    "query",
    "--project",
    projectId,
    "--report-key",
    query.reportKey,
    "--last",
    "7d"
  ];
  expect((await runCli(args, { analyticsReportCommand })).exitCode).toBe(0);
  expect(analyticsReportCommand).toHaveBeenCalledWith({ query: recent });
  expect((await runCli([...args, "--from", query.from], { analyticsReportCommand })).exitCode).toBe(
    4
  );
});
