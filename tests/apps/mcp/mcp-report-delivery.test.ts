import { expect, it, vi } from "vitest";
import {
  createReportDeliveryMcpTools,
  REPORT_DELIVERY_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/report-delivery-tools.js";
import {
  reportEmailDeliveryFixture,
  reportOrg,
  reportRequest
} from "../../helpers/smart-reports.js";
it("lists safe delivery states as read-only metadata without resending uncertain mail", async () => {
  const delivery = reportEmailDeliveryFixture(),
    list = vi.fn().mockResolvedValue([delivery]),
    tools = createReportDeliveryMcpTools({ list }),
    input = { bearerToken: "member", organizationId: reportOrg, runId: reportRequest };
  expect(await tools.list_report_deliveries(input)).toEqual({ deliveries: [delivery] });
  expect(list).toHaveBeenCalledWith(input);
  expect(REPORT_DELIVERY_MCP_TOOL_CATALOG[0]?.annotations).toMatchObject({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  });
  await expect(tools.list_report_deliveries({ ...input, force_resend: true })).rejects.toThrow(
    "invalid_report_input"
  );
  expect(list).toHaveBeenCalledOnce();
});
