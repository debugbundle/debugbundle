import { expect, it, vi } from "vitest";
import {
  createAnalyticsErasureStatusApi,
  type AnalyticsErasureStatusHttpClient
} from "../../../apps/cli/src/analytics-erasure-status-api.js";
import { analyticsErasureStatusWithAuthCommand } from "../../../apps/cli/src/analytics-erasure-status-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const query = { projectId, taskId };
const task = {
  protocol: "2026-09-analytics-erasure-01",
  task_id: taskId,
  project_id: projectId,
  cutoff_at: "2026-09-30T18:00:00.000Z",
  status: "pending",
  completed_at: null
};

it("validates scoped payload-free erasure status responses", async () => {
  const request = vi
    .fn<AnalyticsErasureStatusHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: task })
    .mockResolvedValueOnce({ status: 200, body: { ...task, subject_ref: "secret" } })
    .mockResolvedValueOnce({ status: 200, body: { ...task, project_id: taskId } });
  const api = createAnalyticsErasureStatusApi({ request });
  expect(await api.read({ bearerToken: "member", query })).toEqual(task);
  expect(request).toHaveBeenCalledWith({
    method: "GET",
    path: `/v1/projects/${projectId}/analytics/identity/erasures/${taskId}`,
    bearerToken: "member"
  });
  await expect(api.read({ bearerToken: "member", query })).rejects.toThrow(
    "invalid_analytics_erasure_status_response"
  );
  await expect(api.read({ bearerToken: "member", query })).rejects.toThrow(
    "invalid_analytics_erasure_status_response"
  );
});

it("routes the member command and prints only task progress", async () => {
  const analyticsErasureStatusCommand = vi
    .fn<typeof analyticsErasureStatusWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  const args = ["analytics", "erasures", "status", "--project", projectId, "--task", taskId];
  expect((await runCli(args, { analyticsErasureStatusCommand })).exitCode).toBe(0);
  expect(analyticsErasureStatusCommand).toHaveBeenCalledWith({ query });
  expect(
    (await runCli([...args, "--extra", "x"], { analyticsErasureStatusCommand })).exitCode
  ).toBe(4);
  const readAuthState = vi.fn().mockResolvedValue({
    bearer_token: "member",
    base_url: "https://api.example.test"
  });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(task)));
  expect(
    await analyticsErasureStatusWithAuthCommand({ query }, { readAuthState, fetchImpl })
  ).toEqual({
    exitCode: 0,
    output: `task_id: ${taskId}\nstatus: pending\ncutoff_at: ${task.cutoff_at}\ncompleted_at: pending`
  });
});
