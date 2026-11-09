import { expect, it, vi } from "vitest";
import { createReportRunApi } from "../../../packages/report-client/src/index.js";
import {
  reportRunFixture,
  reportOrg,
  reportId,
  reportRequest
} from "../../helpers/smart-reports.js";
const scope = { bearerToken: "member", organizationId: reportOrg };
const command = {
  request_id: reportRequest,
  definition_id: reportId,
  expected_version: 1,
  period: reportRunFixture().period
};
it("sends a stable reviewed command without selecting a model or enlarging the report budget", async () => {
  const request = vi.fn().mockResolvedValue({ status: 202, body: { run: reportRunFixture() } }),
    api = createReportRunApi({ request });
  expect(await api.generate({ ...scope, command })).toEqual(reportRunFixture());
  expect(request).toHaveBeenCalledWith({
    method: "POST",
    path: `/v1/organizations/${reportOrg}/reports`,
    bearerToken: "member",
    body: { ...command, send_email: false }
  });
  await expect(
    api.generate({ ...scope, command: { ...command, model: "external" } as typeof command })
  ).rejects.toThrow("invalid_payload");
  expect(request).toHaveBeenCalledTimes(1);
});
it("keeps an empty authorised page cursor so callers can reach later readable history", async () => {
  const cursor = Buffer.from(
    JSON.stringify({ at: reportRunFixture().created_at, id: reportRequest })
  ).toString("base64url");
  const request = vi
      .fn()
      .mockResolvedValue({ status: 200, body: { runs: [], next_cursor: cursor } }),
    api = createReportRunApi({ request });
  expect(await api.list({ ...scope, cursor, limit: 1 })).toEqual({ runs: [], next_cursor: cursor });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: `/v1/organizations/${reportOrg}/reports?limit=1&cursor=${cursor}`
    })
  );
  await expect(api.list({ ...scope, cursor: "invalid" })).rejects.toThrow("invalid_payload");
  expect(request).toHaveBeenCalledTimes(1);
});
it("retains quota errors and rejects private or malformed records and unsafe resource paths", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ status: 429, body: { error: "report_quota_exhausted" } })
    .mockResolvedValueOnce({
      status: 200,
      body: { run: { ...reportRunFixture(), lease_token: reportRequest } }
    });
  const api = createReportRunApi({ request });
  await expect(api.generate({ ...scope, command })).rejects.toMatchObject({
    status: 429,
    code: "report_quota_exhausted"
  });
  await expect(api.get({ ...scope, runId: reportRequest })).rejects.toThrow("invalid_response");
  await expect(api.get({ ...scope, runId: "../other" })).rejects.toThrow("invalid_resource_id");
  expect(request).toHaveBeenCalledTimes(2);
});
