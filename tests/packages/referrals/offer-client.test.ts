import { expect, it, vi } from "vitest";
import {
  createOfferApi,
  OFFER_OPERATIONS,
  OfferApiError
} from "../../../packages/referral-client/src/offer-api.js";
import { createOfferMcpTools, OFFER_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/offer-tools.js";
import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
it.each([7500, 10000])(
  "uses the selected %i basis-point rate through the shared client and MCP",
  async (rate) => {
    const version = {
      ...offerVersion,
      state: "draft" as const,
      policy: { ...offerVersion.policy, commission_basis_points: rate }
    };
    const payload = {
      name: version.name,
      public_description: version.public_description,
      policy: version.policy
    };
    const request = vi.fn().mockResolvedValue({ status: 200, body: { programme: version } });
    const client = createOfferApi({ request });
    const auth = { bearerToken: "member", operatorProof: "a".repeat(43) };
    expect(
      (await client.execute("draft", payload, auth)).programme.policy.commission_basis_points
    ).toBe(rate);
    const tools = createOfferMcpTools(client);
    await expect(
      tools["create_offer_programme_draft"]({
        ...payload,
        bearerToken: auth.bearerToken,
        operatorAuthorization: auth.operatorProof
      })
    ).resolves.toMatchObject({ programme: { policy: { commission_basis_points: rate } } });
    expect(request).toHaveBeenCalledTimes(2);
    for (const [sent] of request.mock.calls)
      expect(sent).toMatchObject({
        path: "/v2/offers/operator/programmes",
        body: { policy: { commission_basis_points: rate } }
      });
  }
);
it("binds a state mutation to the exact path, expected state and supplemental operator proof", async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ status: 200, body: { programme: { ...offerVersion, state: "paused" } } });
  const result = await createOfferApi({ request }).execute(
    "state",
    {
      version_id: offerVersion.version_id,
      state: "paused",
      expected_state: "active",
      acknowledge_unlimited: false
    },
    { bearerToken: "member", operatorProof: "operator-proof" }
  );
  expect(result.programme.state).toBe("paused");
  expect(request).toHaveBeenCalledExactlyOnceWith({
    method: "POST",
    path: `/v2/offers/operator/programmes/${offerVersion.version_id}/state`,
    bearerToken: "member",
    operatorProof: "operator-proof",
    body: { state: "paused", expected_state: "active", acknowledge_unlimited: false }
  });
});
it("rejects raw provider or private payloads instead of returning them to clients", async () => {
  const client = createOfferApi({
    request: vi.fn().mockResolvedValue({ status: 200, body: { enabled: true, secret: "private" } })
  });
  await expect(client.execute("capabilities", {})).rejects.toMatchObject({
    code: "invalid_offer_response"
  });
  const failed = createOfferApi({
    request: vi.fn().mockResolvedValue({ status: 500, body: { error: "secret=raw-stack" } })
  });
  await expect(failed.execute("capabilities", {})).rejects.toMatchObject({
    code: "offer_request_failed"
  });
});
it("keeps complete ordinary MCP and documented HTTP operation parity while requiring explicit operator proof", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, body: { programmes: [] } }),
    tools = createOfferMcpTools(createOfferApi({ request }));
  expect(OFFER_MCP_TOOL_CATALOG).toHaveLength(Object.keys(OFFER_OPERATIONS).length);
  const spec = buildPublicOpenApiSpec() as {
    paths: Record<string, Record<string, { security: unknown[] }>>;
  };
  for (const operation of Object.values(OFFER_OPERATIONS))
    expect(
      spec.paths[operation.path.replace(/:(\w+)/g, "{$1}")]?.[operation.method.toLowerCase()]
    ).toBeDefined();
  await expect(tools["list_offer_operator_programmes"]({ bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:invalid_offer_input"
  );
  expect(request).not.toHaveBeenCalled();
  await tools["list_offer_operator_programmes"]({
    bearerToken: "member",
    operatorAuthorization: "a".repeat(43),
    limit: 25
  });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ operatorProof: "a".repeat(43), bearerToken: "member" })
  );
  const security = spec.paths["/v2/offers/operator/programmes"]!["get"]!.security;
  expect(security).toEqual([
    { browserSession: [] },
    { memberBearerToken: [], offerOperatorAuthorization: [] }
  ]);
});
it("retains safe error classes without embedding secrets in error text", () => {
  const error = new OfferApiError(409, "programme_changed");
  expect(error.message).toBe("offer_api_error:409:programme_changed");
});
