import { expect, it, vi } from "vitest";
import {
  createAnalyticsSpaceApi,
  type AnalyticsSpaceHttpClient
} from "../../../apps/cli/src/analytics-space-api.js";
import { analyticsSpacesWithAuthCommand } from "../../../apps/cli/src/analytics-space-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";
import {
  SPACE_ID as id,
  SPACE_ORGANIZATION as organizationId,
  SPACE_CHANGE as change,
  SPACE_RECORD as space,
  SPACE_PREVIEW as preview
} from "../../helpers/analytics-space-fixtures.js";

it("uses canonical HTTP paths, strict responses and the exact reviewed apply payload", async () => {
  const request = vi
    .fn<AnalyticsSpaceHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: { spaces: [space] } })
    .mockResolvedValueOnce({ status: 200, body: { space, replayed: false } })
    .mockResolvedValueOnce({ status: 200, body: preview })
    .mockResolvedValueOnce({ status: 200, body: { space, replayed: false } });
  const api = createAnalyticsSpaceApi({ request });
  const bearerToken = "stored-token";
  expect(
    await api.execute({ bearerToken, operation: { operation: "list", organizationId } })
  ).toEqual({ spaces: [space] });
  expect(await api.execute({ bearerToken, operation: { operation: "get", spaceId: id } })).toEqual({
    space,
    replayed: false
  });
  expect(
    await api.execute({ bearerToken, operation: { operation: "preview", spaceId: null, change } })
  ).toEqual(preview);
  await api.execute({
    bearerToken,
    operation: { operation: "apply", spaceId: null, change, previewHash: preview.preview_hash }
  });
  expect(request.mock.calls.map(([input]) => input)).toEqual([
    { method: "GET", path: `/v1/analytics/spaces?organization_id=${organizationId}`, bearerToken },
    { method: "GET", path: `/v1/analytics/spaces/${id}`, bearerToken },
    { method: "POST", path: "/v1/analytics/spaces/preview", bearerToken, body: change },
    {
      method: "POST",
      path: "/v1/analytics/spaces/apply",
      bearerToken,
      body: { change, preview_hash: preview.preview_hash }
    }
  ]);
  request.mockResolvedValueOnce({ status: 200, body: { space: { ...space, secret: "never" } } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", spaceId: id } })
  ).rejects.toThrow("invalid_analytics_space_response");
  request.mockResolvedValueOnce({ status: 409, body: { error: "analytics_space_conflict" } });
  await expect(
    api.execute({
      bearerToken,
      operation: { operation: "apply", spaceId: id, change, previewHash: preview.preview_hash }
    })
  ).rejects.toThrow("analytics_space_conflict");
});
it("routes list/get/preview/apply and rejects missing approval hashes before authentication", async () => {
  const analyticsSpacesCommand = vi
    .fn<typeof analyticsSpacesWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  await runCli(["analytics", "spaces", "list", "--organization", organizationId, "--json"], {
    analyticsSpacesCommand
  });
  await runCli(["analytics", "spaces", "get", id], { analyticsSpacesCommand });
  await runCli(["analytics", "spaces", "preview", "--change-json", JSON.stringify(change)], {
    analyticsSpacesCommand
  });
  await runCli(
    [
      "analytics",
      "spaces",
      "apply",
      "--space",
      id,
      "--change-json",
      JSON.stringify(change),
      "--preview-hash",
      preview.preview_hash
    ],
    { analyticsSpacesCommand }
  );
  expect(analyticsSpacesCommand.mock.calls.map(([input]) => input)).toEqual([
    { operation: { operation: "list", organizationId }, json: true },
    { operation: { operation: "get", spaceId: id } },
    { operation: { operation: "preview", spaceId: null, change } },
    { operation: { operation: "apply", spaceId: id, change, previewHash: preview.preview_hash } }
  ]);
  expect(
    (
      await runCli(["analytics", "spaces", "apply", "--change-json", JSON.stringify(change)], {
        analyticsSpacesCommand
      })
    ).exitCode
  ).toBe(4);
  expect(
    (
      await runCli(
        ["analytics", "spaces", "list", "--organization", organizationId, "--untrusted", "x"],
        { analyticsSpacesCommand }
      )
    ).exitCode
  ).toBe(4);
  expect(analyticsSpacesCommand).toHaveBeenCalledTimes(4);
});
it("loads stored authentication, returns machine output and bounds protocol errors", async () => {
  const readAuthState = vi
    .fn()
    .mockResolvedValue({ bearer_token: "stored-token", base_url: "https://api.example.test" });
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(preview), { status: 200 }));
  const result = await analyticsSpacesWithAuthCommand(
    {
      operation: { operation: "preview", spaceId: null, change },
      authFilePath: "/tmp/test-auth",
      json: true
    },
    { readAuthState, fetchImpl }
  );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toEqual(preview);
  expect(readAuthState).toHaveBeenCalledWith({ authFilePath: "/tmp/test-auth" });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.example.test/v1/analytics/spaces/preview",
    expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer stored-token" })
    })
  );
  fetchImpl.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "analytics_space_conflict" }), { status: 409 })
  );
  expect(
    await analyticsSpacesWithAuthCommand(
      { operation: { operation: "apply", spaceId: id, change, previewHash: preview.preview_hash } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 4, output: "analytics_space_conflict" });
  fetchImpl.mockResolvedValueOnce(new Response("untrusted confidential response", { status: 500 }));
  expect(
    await analyticsSpacesWithAuthCommand(
      { operation: { operation: "get", spaceId: id } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 1, output: "analytics_space_request_failed" });
});

it("renders bounded human-readable results and preserves authentication/not-found exit codes", async () => {
  const readAuthState = vi
    .fn()
    .mockResolvedValue({ bearer_token: "stored-token", base_url: "https://api.example.test" });
  const fetchImpl = vi.fn<typeof fetch>();
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  fetchImpl.mockResolvedValueOnce(response({ spaces: [space] }));
  expect(
    (
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "list", organizationId } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toContain(`${id} Product (revision 1, 1 projects)`);
  fetchImpl.mockResolvedValueOnce(response({ spaces: [] }));
  expect(
    (
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "list", organizationId } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toBe("No analytics spaces.");
  fetchImpl.mockResolvedValueOnce(response({ space, replayed: false }));
  expect(
    (
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "get", spaceId: id } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toContain("archived: false");
  fetchImpl.mockResolvedValueOnce(response(preview));
  expect(
    (
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "preview", spaceId: null, change } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toContain(`preview_hash: ${preview.preview_hash}\ndisplay_name: Product`);
  for (const [status, exitCode, reason] of [
    [401, 2, "invalid_member_token"],
    [404, 3, "analytics_space_not_found"]
  ] as const) {
    fetchImpl.mockResolvedValueOnce(response({ error: reason }, status));
    expect(
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "get", spaceId: id } },
        { readAuthState, fetchImpl }
      )
    ).toEqual({ exitCode, output: reason });
  }
  fetchImpl.mockRejectedValueOnce(new Error("untrusted transport details"));
  expect(
    await analyticsSpacesWithAuthCommand(
      { operation: { operation: "get", spaceId: id } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 1, output: "analytics_space_request_failed" });
  const before = readAuthState.mock.calls.length;
  expect(
    (
      await analyticsSpacesWithAuthCommand(
        { operation: { operation: "get", spaceId: "invalid" } },
        { readAuthState, fetchImpl }
      )
    ).exitCode
  ).toBe(4);
  expect(readAuthState).toHaveBeenCalledTimes(before);
  expect(
    (
      await analyticsSpacesWithAuthCommand({
        operation: { operation: "get", spaceId: id },
        authFilePath: "/tmp/analytics-space-nonexistent-auth-file"
      })
    ).exitCode
  ).toBe(2);
  expect((await runCli(["analytics", "spaces", "unknown"])).exitCode).toBe(4);
});
