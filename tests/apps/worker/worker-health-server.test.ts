import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWorkerRuntimeMocks } from "../../helpers/worker-runtime-mocks.js";
import {
  createWorkerHealthServer,
  createWorkerShutdownState
} from "../../../apps/worker/src/runtime.js";

describe("worker health server", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should start worker health server and return health status", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; uptime: number };

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
    } finally {
      server.close();
    }
  });

  it("should return ready status on worker health server", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string };

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ready" });
    } finally {
      server.close();
    }
  });

  it("should return not-ready status on worker health server when readiness check fails", async (): Promise<void> => {
    const server = createWorkerHealthServer({
      port: 0,
      readinessCheck: vi.fn().mockRejectedValueOnce(new Error("worker_s3_bucket_unreachable"))
    });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; reason: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({ status: "not_ready", reason: "worker_s3_bucket_unreachable" });
    } finally {
      server.close();
    }
  });

  it("should return not-ready status while worker shutdown is draining", async (): Promise<void> => {
    const shutdownState = createWorkerShutdownState();
    const readinessCheck = vi.fn().mockResolvedValue(undefined);
    const server = createWorkerHealthServer({
      port: 0,
      readinessCheck: () => shutdownState.readinessCheck(readinessCheck)
    });

    try {
      shutdownState.requestShutdown();

      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; reason: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({ status: "not_ready", reason: "worker_draining" });
      expect(readinessCheck).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("should return live status on worker health server", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/live`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string };

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "live" });
    } finally {
      server.close();
    }
  });

  it("should return 404 for unknown worker health server paths", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/unknown`);

      expect(response.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
