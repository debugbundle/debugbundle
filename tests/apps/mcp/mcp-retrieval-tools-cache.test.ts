import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("mcp retrieval tools cloud cache", () => {
  it("persists and refreshes cloud bundle and reproduction artifacts in connected mode", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const getBundle = vi
      .fn()
      .mockResolvedValueOnce({ bundle_version: 1, incident_id: "inc_cloud_prod", status: "ready" })
      .mockResolvedValueOnce({ bundle_version: 2, incident_id: "inc_cloud_prod", status: "updated" });
    const getReproduction = vi
      .fn()
      .mockResolvedValueOnce({ possible: true, confidence: 0.8, reason: "request_context_available" })
      .mockResolvedValueOnce({ possible: false, confidence: 0.2, reason: "request_context_missing" });

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {

      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
        getIncident: vi.fn(),
        getIncidentContext: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle,
        getLogs: vi.fn(),
        getReproduction
      });

      await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        bundle_version: 1,
        incident_id: "inc_cloud_prod",
        status: "ready",
        source: "cloud"
      });
      await expect(tools.get_reproduction({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        possible: true,
        confidence: 0.8,
        reason: "request_context_available",
        source: "cloud"
      });
      await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        bundle_version: 2,
        incident_id: "inc_cloud_prod",
        status: "updated",
        source: "cloud"
      });
      await expect(tools.get_reproduction({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        possible: false,
        confidence: 0.2,
        reason: "request_context_missing",
        source: "cloud"
      });

      expect(
        JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))
      ).toEqual({
        bundle_version: 2,
        incident_id: "inc_cloud_prod",
        status: "updated",
        source: "cloud"
      });
      expect(
        JSON.parse(
          readFileSync(
            join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
            "utf8"
          )
        )
      ).toEqual({
        possible: false,
        confidence: 0.2,
        reason: "request_context_missing",
        source: "cloud"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("updates cached cloud artifacts when resolving a cloud incident in connected mode", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      mkdirSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"), { recursive: true });
      writeFileSync(
        join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"),
        `${JSON.stringify({ incident_id: "inc_cloud_prod", status: "open", resolved_at: null, source: "cloud" }, null, 2)}\n`,
        "utf8"
      );
      writeFileSync(
        join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
        `${JSON.stringify({ incident_id: "inc_cloud_prod", status: "open", resolved_at: null, source: "cloud" }, null, 2)}\n`,
        "utf8"
      );

      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
        getIncident: vi.fn(),
        getIncidentContext: vi.fn(),
        resolveIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_cloud_prod",
          status: "resolved",
          resolved_at: "2026-03-20T00:05:00.000Z"
        }),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.resolve_incident({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        incident: {
          incident_id: "inc_cloud_prod",
          status: "resolved",
          resolved_at: "2026-03-20T00:05:00.000Z",
          source: "cloud"
        }
      });

      expect(JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))).toEqual({
        incident_id: "inc_cloud_prod",
        status: "resolved",
        resolved_at: "2026-03-20T00:05:00.000Z",
        source: "cloud"
      });
      expect(
        JSON.parse(
          readFileSync(
            join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
            "utf8"
          )
        )
      ).toEqual({
        incident_id: "inc_cloud_prod",
        status: "resolved",
        resolved_at: "2026-03-20T00:05:00.000Z",
        source: "cloud"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("prunes expired cloud cache artifacts when a fresh cloud artifact is fetched", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      mkdirSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"), { recursive: true });
      const staleBundlePath = join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_stale.bundle.json");
      const staleReproductionPath = join(
        rootDirectory,
        ".debugbundle",
        "bundles",
        "cloud",
        "reproductions",
        "inc_stale.reproduction.json"
      );
      writeFileSync(staleBundlePath, `${JSON.stringify({ incident_id: "inc_stale", source: "cloud" }, null, 2)}\n`, "utf8");
      writeFileSync(staleReproductionPath, `${JSON.stringify({ incident_id: "inc_stale", source: "cloud" }, null, 2)}\n`, "utf8");
      utimesSync(staleBundlePath, staleDate, staleDate);
      utimesSync(staleReproductionPath, staleDate, staleDate);

      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
        getIncident: vi.fn(),
        getIncidentContext: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn().mockResolvedValue({ bundle_version: 1, incident_id: "inc_cloud_prod", status: "ready" }),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        bundle_version: 1,
        incident_id: "inc_cloud_prod",
        status: "ready",
        source: "cloud"
      });

      expect(() => readFileSync(staleBundlePath, "utf8")).toThrow();
      expect(() => readFileSync(staleReproductionPath, "utf8")).toThrow();
      expect(JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))).toEqual({
        bundle_version: 1,
        incident_id: "inc_cloud_prod",
        status: "ready",
        source: "cloud"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
