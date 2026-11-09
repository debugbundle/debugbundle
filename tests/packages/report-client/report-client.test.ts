import { reportAllowanceFixture } from "../../helpers/smart-reports.js";
import { describe, expect, it, vi } from "vitest";
import { createReportApi } from "../../../packages/report-client/src/index.js";
import {
  reportDefinitionFixture,
  reportDefinitionInput,
  reportOrg,
  reportId,
  reportRequest
} from "../../helpers/smart-reports.js";
describe("report definition client", () => {
  it("uses explicit org and request identity while parsing authoritative records", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ status: 201, body: { definition: reportDefinitionFixture() } });
    const api = createReportApi({ request });
    expect(
      (
        await api.create({
          bearerToken: "member",
          organizationId: reportOrg,
          requestId: reportRequest,
          definition: reportDefinitionInput()
        })
      ).id
    ).toBe(reportId);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: `/v1/organizations/${reportOrg}/report-definitions`,
        body: expect.objectContaining({
          request_id: reportRequest,
          definition: expect.objectContaining({ privacy_mode: "full", enabled: false })
        })
      })
    );
  });
  it("refuses invalid consent and resource identifiers before transport", async () => {
    const request = vi.fn(),
      api = createReportApi({ request });
    await expect(
      api.create({
        bearerToken: "member",
        organizationId: reportOrg,
        requestId: reportRequest,
        definition: { ...reportDefinitionInput(), source_collection_consent: false }
      })
    ).rejects.toThrow("invalid_payload");
    await expect(
      api.get({ bearerToken: "member", organizationId: "../other", definitionId: reportId })
    ).rejects.toThrow("invalid_resource_id");
    expect(request).not.toHaveBeenCalled();
  });
  it("retains server conflicts and refuses malformed or expanded public DTOs", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 409, body: { error: "report_version_conflict" } })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          definition: { ...reportDefinitionFixture(), initiating_authority: { user_id: reportId } }
        }
      });
    const api = createReportApi({ request }),
      input = { bearerToken: "member", organizationId: reportOrg, definitionId: reportId };
    await expect(
      api.replace({ ...input, definition: { ...reportDefinitionInput(), expected_version: 1 } })
    ).rejects.toMatchObject({
      status: 409,
      code: "report_version_conflict"
    });
    await expect(api.get(input)).rejects.toThrow("invalid_response");
  });
});

it("reads a strict shared allowance under an authorised saved definition", async () => {
  const allowance = reportAllowanceFixture(),
    request = vi.fn().mockResolvedValue({ status: 200, body: { allowance } }),
    api = createReportApi({ request });
  expect(
    await api.allowance({
      bearerToken: "member",
      organizationId: reportOrg,
      definitionId: reportId
    })
  ).toEqual(allowance);
  expect(request).toHaveBeenCalledWith({
    method: "GET",
    path: `/v1/organizations/${reportOrg}/report-definitions/${reportId}/allowance`,
    bearerToken: "member"
  });
  request.mockResolvedValueOnce({
    status: 200,
    body: { allowance: { ...allowance, remaining: 40 } }
  });
  await expect(
    api.allowance({ bearerToken: "member", organizationId: reportOrg, definitionId: reportId })
  ).rejects.toThrow("invalid_response");
});
