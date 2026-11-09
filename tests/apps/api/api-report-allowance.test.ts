import { expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import {
  reportAllowanceFixture,
  reportOrg,
  reportProject,
  reportRequest
} from "../../helpers/smart-reports.js";
it("reads the shared allowance through a known whole-scope definition without enabling generation", async () => {
  const allowance = reportAllowanceFixture(),
    read = vi.fn().mockResolvedValue(allowance),
    app = createTokenApiServer({
      reportGenerationEnabled: false,
      reportAllowance: { read },
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
    });
  const url = `/v1/organizations/${reportOrg}/report-definitions/${reportRequest}/allowance`,
    headers = { authorization: "Bearer dbundle_mem_reader" };
  const response = await app.inject({ method: "GET", url, headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ allowance });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      organization_id: reportOrg,
      definition_id: reportRequest,
      initiator: expect.objectContaining({ user_id: reportProject, token_id: reportRequest })
    })
  );
  read.mockResolvedValueOnce({ ...allowance, private_scope: "hidden" });
  const invalid = await app.inject({ method: "GET", url, headers });
  expect(invalid.statusCode).toBe(500);
  expect(invalid.body).not.toContain("hidden");
  read.mockRejectedValueOnce(new SmartReportError("report_not_found"));
  expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(404);
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
});
