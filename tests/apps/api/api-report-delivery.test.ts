import { expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import {
  reportEmailDeliveryFixture,
  reportOrg,
  reportProject,
  reportRequest
} from "../../helpers/smart-reports.js";
it("exposes only closed delivery states to current scoped archive readers and withholds provider receipts", async () => {
  const delivery = reportEmailDeliveryFixture(),
    list = vi.fn().mockResolvedValue([delivery]),
    app = createTokenApiServer({
      reportGenerationEnabled: false,
      reportEmail: { list },
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: reportProject,
          organization_id: reportOrg,
          token_id: reportRequest,
          role: "member",
          token_policy: {
            version: 1,
            mode: "projects",
            permissions: ["project:read"],
            projects: [{ project_id: reportProject, origin_project_ids: [reportProject] }]
          }
        })
      })
    }),
    url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/deliveries`,
    headers = { authorization: "Bearer dbundle_mem_reader" };
  const response = await app.inject({ method: "GET", url, headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ deliveries: [delivery] });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({
      organization_id: reportOrg,
      id: reportRequest,
      initiator: expect.objectContaining({ user_id: reportProject, token_id: reportRequest })
    })
  );
  list.mockResolvedValueOnce([{ ...delivery, provider_message_id: "private-provider-receipt" }]);
  const invalid = await app.inject({ method: "GET", url, headers });
  expect(invalid.statusCode).toBe(500);
  expect(invalid.body).not.toContain("private-provider");
  list.mockRejectedValueOnce(new SmartReportError("report_not_found"));
  expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(404);
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
});
