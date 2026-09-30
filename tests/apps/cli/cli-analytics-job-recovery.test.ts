import { expect, it, vi } from "vitest";
import {
  createAnalyticsJobRecoveryApi,
  type AnalyticsJobRecoveryHttpClient
} from "../../../apps/cli/src/analytics-job-recovery-api.js";
import { analyticsJobRecoveryWithAuthCommand } from "../../../apps/cli/src/analytics-job-recovery-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const retry = { projectId, eventId };
const response = { project_id: projectId, event_id: eventId, status: "queued" as const };

it("uses the exact no-body retry route and validates bounded responses", async () => {
  const request = vi
    .fn<AnalyticsJobRecoveryHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 202, body: response })
    .mockResolvedValueOnce({ status: 202, body: { ...response, raw: "never" } })
    .mockResolvedValueOnce({ status: 409, body: { error: "analytics_job_recovery_unavailable" } });
  const api = createAnalyticsJobRecoveryApi({ request });
  expect(await api.retry({ bearerToken: "member", retry })).toEqual(response);
  expect(request).toHaveBeenCalledWith({
    method: "POST",
    path: `/v1/projects/${projectId}/analytics/events/${eventId}/retry`,
    bearerToken: "member"
  });
  await expect(api.retry({ bearerToken: "member", retry })).rejects.toThrow(
    "invalid_analytics_job_recovery_response"
  );
  await expect(api.retry({ bearerToken: "member", retry })).rejects.toThrow(
    "analytics_job_recovery_unavailable"
  );
});

it("routes the scoped retry command and reports only queued status", async () => {
  const analyticsJobRecoveryCommand = vi
    .fn<typeof analyticsJobRecoveryWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  const args = ["analytics", "jobs", "retry", "--project", projectId, "--event", eventId];
  expect((await runCli(args, { analyticsJobRecoveryCommand })).exitCode).toBe(0);
  expect(analyticsJobRecoveryCommand).toHaveBeenCalledWith({ retry });
  expect((await runCli([...args, "--raw", "x"], { analyticsJobRecoveryCommand })).exitCode).toBe(4);
  const readAuthState = vi
    .fn()
    .mockResolvedValue({ bearer_token: "member", base_url: "https://api.example.test" });
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(response), { status: 202 }));
  expect(
    await analyticsJobRecoveryWithAuthCommand({ retry }, { readAuthState, fetchImpl })
  ).toEqual({ exitCode: 0, output: `event_id: ${eventId}\nstatus: queued` });
});
