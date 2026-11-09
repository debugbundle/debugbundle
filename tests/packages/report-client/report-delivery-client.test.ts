import { expect, it, vi } from "vitest";
import { createReportDeliveryApi } from "../../../packages/report-client/src/index.js";
import {
  reportEmailDeliveryFixture,
  reportOrg,
  reportRequest
} from "../../helpers/smart-reports.js";
it("reads strict safe receipt metadata without accepting provider or expanded private fields", async () => {
  const delivery = reportEmailDeliveryFixture(),
    request = vi.fn().mockResolvedValue({ status: 200, body: { deliveries: [delivery] } }),
    api = createReportDeliveryApi({ request }),
    input = { bearerToken: "member", organizationId: reportOrg, runId: reportRequest };
  expect(await api.list(input)).toEqual([delivery]);
  expect(request).toHaveBeenCalledWith({
    method: "GET",
    path: `/v1/organizations/${reportOrg}/reports/${reportRequest}/deliveries`,
    bearerToken: "member"
  });
  request.mockResolvedValueOnce({
    status: 200,
    body: { deliveries: [{ ...delivery, attempt_id: "private-internal" }] }
  });
  await expect(api.list(input)).rejects.toThrow("invalid_response");
});
