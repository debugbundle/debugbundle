import { expect, it, vi } from "vitest";
import {
  createAnalyticsIdentityNamespaceApi,
  type AnalyticsIdentityNamespaceHttpClient
} from "../../../apps/cli/src/analytics-identity-namespace-api.js";
import { analyticsIdentityNamespaceWithAuthCommand } from "../../../apps/cli/src/analytics-identity-namespace-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const namespace = {
  project_id: projectId,
  namespace_revision: 1,
  key_fingerprint: `sha256:${"a".repeat(64)}`,
  activated_at: "2026-09-29T12:00:00.000Z",
  revoked_at: null
};
const change = {
  action: "configure" as const,
  expected_revision: 0,
  idempotency_key: "22222222-2222-4222-8222-222222222222",
  key_fingerprint: namespace.key_fingerprint
};
const preview = {
  project_id: projectId,
  action: "configure",
  expected_revision: 0,
  resulting_revision: 1,
  current_key_fingerprint: null,
  proposed_key_fingerprint: namespace.key_fingerprint,
  contexts_fenced: false,
  preview_hash: "b".repeat(64)
};

it("uses strict get, preview and apply responses with the reviewed hash", async () => {
  const request = vi
    .fn<AnalyticsIdentityNamespaceHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: namespace })
    .mockResolvedValueOnce({ status: 200, body: preview })
    .mockResolvedValueOnce({ status: 200, body: { namespace, replayed: false } });
  const api = createAnalyticsIdentityNamespaceApi({ request });
  const bearerToken = "stored-member";
  expect(await api.execute({ bearerToken, operation: { operation: "get", projectId } })).toEqual(
    namespace
  );
  expect(
    await api.execute({ bearerToken, operation: { operation: "preview", projectId, change } })
  ).toEqual(preview);
  expect(
    await api.execute({
      bearerToken,
      operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash }
    })
  ).toEqual({ namespace, replayed: false });
  const path = `/v1/projects/${projectId}/analytics/identity-namespace`;
  expect(request.mock.calls.map(([input]) => input)).toEqual([
    { method: "GET", path, bearerToken },
    { method: "POST", path: `${path}/preview`, bearerToken, body: change },
    {
      method: "POST",
      path: `${path}/apply`,
      bearerToken,
      body: { change, preview_hash: preview.preview_hash }
    }
  ]);
  request.mockResolvedValueOnce({ status: 200, body: { ...namespace, key: "raw" } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "get", projectId } })
  ).rejects.toThrow("invalid_analytics_identity_namespace_response");
});

it("routes owner namespace CLI commands and rejects an apply without preview hash", async () => {
  const command = vi
    .fn<typeof analyticsIdentityNamespaceWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  await runCli(["analytics", "identity-namespace", "get", "--project", projectId], {
    analyticsIdentityNamespaceCommand: command
  });
  await runCli(
    [
      "analytics",
      "identity-namespace",
      "preview",
      "--project",
      projectId,
      "--change-json",
      JSON.stringify(change)
    ],
    { analyticsIdentityNamespaceCommand: command }
  );
  await runCli(
    [
      "analytics",
      "identity-namespace",
      "apply",
      "--project",
      projectId,
      "--change-json",
      JSON.stringify(change),
      "--preview-hash",
      preview.preview_hash
    ],
    { analyticsIdentityNamespaceCommand: command }
  );
  expect(command.mock.calls.map(([input]) => input.operation.operation)).toEqual([
    "get",
    "preview",
    "apply"
  ]);
  expect(
    (
      await runCli(
        [
          "analytics",
          "identity-namespace",
          "apply",
          "--project",
          projectId,
          "--change-json",
          JSON.stringify(change)
        ],
        { analyticsIdentityNamespaceCommand: command }
      )
    ).exitCode
  ).toBe(4);
  expect(command).toHaveBeenCalledTimes(3);
});
