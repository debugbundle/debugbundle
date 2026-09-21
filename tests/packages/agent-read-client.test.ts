import { describe, expect, it, vi } from "vitest";
import { createAgentReadClient } from "../../packages/agent-read-client/src/index.js";

describe("restricted evidence transport", () => {
  const token = "dbundle_agent_synthetic";
  it("projects successful responses and encodes pagination without widening the read surface", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          project: { project_id: "project", name: "API password=PACKED_SECRET", raw: "RAW_SECRET" }
        })
      )
      .mockResolvedValueOnce(
        Response.json({ project_id: "project", incidents: [], next_cursor: null })
      );
    const client = createAgentReadClient({ baseUrl: "https://example.test", token, fetchImpl });
    const summary = await client.read({ name: "project_summary", projectId: "project" });
    expect(summary).toMatchObject({ project: { project_id: "project" } });
    expect(JSON.stringify(summary)).not.toContain("SECRET");
    const result = await client.read({
      name: "list_incidents",
      projectId: "project",
      limit: 5,
      cursor: "opaque&token=not-a-query"
    });
    expect(result).toMatchObject({ incidents: [] });
    const url = fetchImpl.mock.calls[1]?.[0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toBe("/v1/agent/projects/project/incidents");
    expect([...url.searchParams.keys()]).toEqual(["limit", "cursor"]);
    expect(url.searchParams.get("cursor")).toBe("opaque&token=not-a-query");
  });

  it("withholds malformed, wrong-project, invalid-UTF8, and oversized response bodies", async () => {
    for (const response of [
      Response.json({ project: { project_id: "other", name: "wrong project" } }),
      Response.json({ raw: "SYNTHETIC_SECRET" }),
      new Response("not JSON SYNTHETIC_SECRET"),
      new Response(new Uint8Array([0xff])),
      new Response("x".repeat(600_001)),
      new Response(null)
    ]) {
      const client = createAgentReadClient({
        baseUrl: "https://example.test",
        token,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
      });
      await expect(client.read({ name: "project_summary", projectId: "project" })).rejects.toThrow(
        /^agent_read_unavailable$/
      );
    }
  });

  it("routes only the fixed incident reads and fails closed on missing IDs or malformed evidence", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ raw: "SYNTHETIC_SECRET" }));
    const client = createAgentReadClient({ baseUrl: "https://example.test", token, fetchImpl });
    for (const [name, suffix] of [
      ["get_incident", ""],
      ["get_incident_context", "/context"],
      ["get_bundle", "/bundle"]
    ] as const) {
      await expect(
        client.read({ name, projectId: "project", incidentId: "incident" })
      ).rejects.toThrow(/^agent_read_unavailable$/);
      expect((fetchImpl.mock.lastCall?.[0] as URL).pathname).toBe(
        `/v1/agent/projects/project/incidents/incident${suffix}`
      );
    }
    await expect(client.read({ name: "get_bundle", projectId: "project" })).rejects.toThrow(
      /^agent_read_invalid_input$/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("sets a deadline, forbids redirects, and never exposes transport error content", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("dbundle_proj_SYNTHETIC_SECRET"));
    const client = createAgentReadClient({ baseUrl: "https://example.test", token, fetchImpl });
    await expect(client.read({ name: "project_summary", projectId: "project" })).rejects.toThrow(
      "agent_read_unavailable"
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      signal: expect.any(AbortSignal)
    });
  });
  it("cancels an error response without reading its raw body", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 403 });
    const client = createAgentReadClient({
      baseUrl: "http://[::1]:3000",
      token,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
    });
    await expect(client.read({ name: "project_summary", projectId: "project" })).rejects.toThrow(
      "agent_read_unavailable"
    );
    expect(cancel).toHaveBeenCalled();
  });
  it("rejects URL credentials and unencrypted remote origins", () => {
    for (const baseUrl of ["https://secret@example.test", "http://example.test"]) {
      expect(() => createAgentReadClient({ baseUrl, token })).toThrow(
        "agent_read_invalid_base_url"
      );
    }
  });
});
