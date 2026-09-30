import { expect, it, vi } from "vitest";
import {
  createAnalyticsWriterApi,
  type AnalyticsWriterHttpClient
} from "../../../apps/cli/src/analytics-writer-api.js";
import { analyticsWritersWithAuthCommand } from "../../../apps/cli/src/analytics-writer-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";
import {
  WRITER_CHANGE as change,
  WRITER_PREVIEW as preview,
  WRITER_PROJECT as projectId,
  WRITER_RECORD as writer,
  WRITER_SECRET as plaintext
} from "../../helpers/analytics-writer-fixtures.js";

it("uses the reviewed writer routes, validates strict responses and bounds remote errors", async () => {
  const request = vi
    .fn<AnalyticsWriterHttpClient["request"]>()
    .mockResolvedValueOnce({
      status: 200,
      body: { project_id: projectId, revision: 0, writers: [] }
    })
    .mockResolvedValueOnce({ status: 200, body: preview })
    .mockResolvedValueOnce({
      status: 200,
      body: { disposition: "issued", revision: 1, replayed: false, writer, plaintext }
    });
  const api = createAnalyticsWriterApi({ request });
  const bearerToken = "stored-member";
  expect(await api.execute({ bearerToken, operation: { operation: "list", projectId } })).toEqual({
    project_id: projectId,
    revision: 0,
    writers: []
  });
  expect(
    await api.execute({ bearerToken, operation: { operation: "preview", projectId, change } })
  ).toEqual(preview);
  expect(
    await api.execute({
      bearerToken,
      operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash }
    })
  ).toMatchObject({ disposition: "issued", plaintext });
  const collection = `/v1/projects/${projectId}/analytics/writers`;
  expect(request.mock.calls.map(([input]) => input)).toEqual([
    { method: "GET", path: collection, bearerToken },
    { method: "POST", path: `${collection}/preview`, bearerToken, body: change },
    {
      method: "POST",
      path: `${collection}/apply`,
      bearerToken,
      body: { change, preview_hash: preview.preview_hash }
    }
  ]);
  request.mockResolvedValueOnce({
    status: 200,
    body: { disposition: "issued", revision: 1, replayed: false, writer, plaintext: "wrong" }
  });
  await expect(
    api.execute({
      bearerToken,
      operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash }
    })
  ).rejects.toThrow("invalid_analytics_writer_response");
  request.mockResolvedValueOnce({ status: 409, body: { error: "analytics_writer_conflict" } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "list", projectId } })
  ).rejects.toThrow("analytics_writer_conflict");
  request.mockResolvedValueOnce({ status: 500, body: { error: plaintext } });
  await expect(
    api.execute({ bearerToken, operation: { operation: "list", projectId } })
  ).rejects.toThrow("analytics_writer_request_failed");
});

it("routes list, preview and apply; rejects missing review hash before authentication", async () => {
  const analyticsWritersCommand = vi
    .fn<typeof analyticsWritersWithAuthCommand>()
    .mockResolvedValue({ exitCode: 0, output: "ok" });
  await runCli(["analytics", "writers", "list", "--project", projectId, "--json"], {
    analyticsWritersCommand
  });
  await runCli(
    [
      "analytics",
      "writers",
      "preview",
      "--project",
      projectId,
      "--change-json",
      JSON.stringify(change)
    ],
    { analyticsWritersCommand }
  );
  await runCli(
    [
      "analytics",
      "writers",
      "apply",
      "--project",
      projectId,
      "--change-json",
      JSON.stringify(change),
      "--preview-hash",
      preview.preview_hash
    ],
    { analyticsWritersCommand }
  );
  expect(analyticsWritersCommand.mock.calls.map(([input]) => input)).toEqual([
    { operation: { operation: "list", projectId }, json: true },
    { operation: { operation: "preview", projectId, change } },
    { operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash } }
  ]);
  expect(
    (
      await runCli(
        [
          "analytics",
          "writers",
          "apply",
          "--project",
          projectId,
          "--change-json",
          JSON.stringify(change)
        ],
        { analyticsWritersCommand }
      )
    ).exitCode
  ).toBe(4);
  expect(analyticsWritersCommand).toHaveBeenCalledTimes(3);
});

it("shows an issued secret once, renders a replay without it and preserves bounded exit codes", async () => {
  const readAuthState = vi.fn().mockResolvedValue({
    bearer_token: "stored-member",
    base_url: "https://api.example.test"
  });
  const fetchImpl = vi.fn<typeof fetch>();
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  fetchImpl.mockResolvedValueOnce(
    response({ disposition: "issued", revision: 1, replayed: false, writer, plaintext })
  );
  const issued = await analyticsWritersWithAuthCommand(
    { operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash } },
    { readAuthState, fetchImpl }
  );
  expect(issued.exitCode).toBe(0);
  expect(issued.output).toContain(plaintext);
  fetchImpl.mockResolvedValueOnce(
    response({ disposition: "secret_unavailable", revision: 1, replayed: true, writer })
  );
  const replay = await analyticsWritersWithAuthCommand(
    { operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash } },
    { readAuthState, fetchImpl }
  );
  expect(replay.exitCode).toBe(0);
  expect(replay.output).toContain("secret_unavailable");
  expect(replay.output).not.toContain(plaintext);
  fetchImpl.mockResolvedValueOnce(response({ error: "analytics_writer_conflict" }, 409));
  expect(
    await analyticsWritersWithAuthCommand(
      { operation: { operation: "preview", projectId, change } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 4, output: "analytics_writer_conflict" });
  expect(
    (
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "list", projectId: "invalid" } },
        { readAuthState, fetchImpl }
      )
    ).exitCode
  ).toBe(4);
});

it("renders bounded metadata and reviewed changes, and contains auth or transport failures", async () => {
  const readAuthState = vi.fn().mockResolvedValue({
    bearer_token: "stored-member",
    base_url: "https://api.example.test"
  });
  const fetchImpl = vi.fn<typeof fetch>();
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  fetchImpl.mockResolvedValueOnce(
    response({ project_id: projectId, revision: 1, writers: [writer] })
  );
  expect(
    (
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "list", projectId } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toContain(`${writer.id} server Billing worker`);
  fetchImpl.mockResolvedValueOnce(response({ project_id: projectId, revision: 1, writers: [] }));
  expect(
    (
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "list", projectId } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toBe("No active analytics writers.\nrevision: 1");
  fetchImpl.mockResolvedValueOnce(response(preview));
  expect(
    (
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "preview", projectId, change } },
        { readAuthState, fetchImpl }
      )
    ).output
  ).toContain(`preview_hash: ${preview.preview_hash}\naction: create`);
  const revokedWriter = { ...writer, revoked_at: "2026-09-28T12:00:00.000Z" };
  fetchImpl.mockResolvedValueOnce(
    response({ disposition: "revoked", revision: 2, replayed: false, writer: revokedWriter })
  );
  const revoked = await analyticsWritersWithAuthCommand(
    {
      operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash },
      json: true
    },
    { readAuthState, fetchImpl }
  );
  expect(JSON.parse(revoked.output)).toMatchObject({
    disposition: "revoked",
    writer: revokedWriter
  });
  expect(revoked.output).not.toContain(plaintext);
  for (const [status, exitCode, reason] of [
    [401, 2, "invalid_member_token"],
    [404, 3, "project_not_found"]
  ] as const) {
    fetchImpl.mockResolvedValueOnce(response({ error: reason }, status));
    expect(
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "list", projectId } },
        { readAuthState, fetchImpl }
      )
    ).toEqual({ exitCode, output: reason });
  }
  fetchImpl.mockRejectedValueOnce(new Error(`untrusted ${plaintext}`));
  expect(
    await analyticsWritersWithAuthCommand(
      { operation: { operation: "list", projectId } },
      { readAuthState, fetchImpl }
    )
  ).toEqual({ exitCode: 1, output: "analytics_writer_request_failed" });
  expect(
    (
      await analyticsWritersWithAuthCommand(
        { operation: { operation: "list", projectId: "bad" } },
        { readAuthState, fetchImpl }
      )
    ).exitCode
  ).toBe(4);
});
