import { protectRuntimeLogRecord } from "../../../packages/runtime-logger/src/privacy.js";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeLoggerFromEnv,
  getErrorMessage,
  resolveRuntimeEnvironment,
  resolveRuntimeLogLevel,
  resolveRuntimeService
} from "../../../packages/runtime-logger/src/index.js";

describe("runtime logger helpers", () => {
  it("reads environment and service overrides from env", () => {
    expect(
      resolveRuntimeEnvironment({
        DEBUGBUNDLE_LOG_ENVIRONMENT: "staging",
        NODE_ENV: "production"
      })
    ).toBe("staging");

    expect(resolveRuntimeService({ DEBUGBUNDLE_LOG_SERVICE: "api-edge" }, "debugbundle-api")).toBe(
      "api-edge"
    );
  });

  it("falls back to safe defaults for invalid log levels and unknown errors", () => {
    expect(resolveRuntimeLogLevel({ DEBUGBUNDLE_LOG_LEVEL: "verbose" })).toBe("info");
    expect(getErrorMessage("oops", "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("never writes raw request payloads or exception interpolation into runtime logs", () => {
    const output: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    try {
      const logger = createRuntimeLoggerFromEnv({ app: "api", defaultService: "api", env: {} });
      logger.error(
        {
          req: {
            method: "POST",
            url: "/SYNTHETIC_PATH_SECRET",
            headers: { authorization: "Bearer SYNTHETIC_HEADER_SECRET" },
            body: { private: "SYNTHETIC_BODY_SECRET" }
          },
          err: new Error("SYNTHETIC_ERROR_SECRET"),
          error: "SYNTHETIC_ERROR_SECRET",
          statusCode: 500
        },
        "upstream_request_failed"
      );
      logger.info("failure token=SYNTHETIC_MESSAGE_SECRET");
      logger.info("dbundle_agent_synthetic_log_secret");
      logger
        .child({ token: "SYNTHETIC_CHILD_SECRET" })
        .info({ duration_ms: 12 }, "worker_job_finished");
      const text = output.join("");
      expect(text).not.toContain("SYNTHETIC_");
      expect(text).not.toContain("dbundle_agent_synthetic_log_secret");
      expect(text).toContain("upstream_request_failed");
      expect(text).toContain('"statusCode":500');
      expect(text).toContain('"method":"POST"');
      expect(text).toContain('"duration_ms":12');
    } finally {
      write.mockRestore();
    }
  });

  it("protects real Fastify child loggers on request failures", async () => {
    const output: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const logger = createRuntimeLoggerFromEnv({ app: "api", defaultService: "api", env: {} });
    const app = Fastify({ loggerInstance: logger });
    app.get("/*", async () => {
      throw new Error("SYNTHETIC_UPSTREAM_SECRET");
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/SYNTHETIC_PATH_SECRET?token=SYNTHETIC_QUERY_SECRET",
        headers: { "x-private": "SYNTHETIC_HEADER_SECRET" }
      });
      expect(response.statusCode).toBe(500);
      const text = output.join("");
      expect(text).not.toContain("SYNTHETIC_");
      expect(text).toContain('"statusCode":500');
      expect(text).toContain("request completed");
    } finally {
      await app.close();
      write.mockRestore();
    }
  });

  it("bounds malformed logging inputs without invoking application getters", () => {
    const getter = vi.fn(() => "secret");
    expect(
      protectRuntimeLogRecord(Object.defineProperty({}, "body", { get: getter, enumerable: true }))
    ).toEqual({});
    expect(getter).not.toHaveBeenCalled();
    expect(
      protectRuntimeLogRecord(
        Object.fromEntries(Array.from({ length: 257 }, (_, i) => [String(i), i]))
      )
    ).toEqual({ privacy: "withheld" });
    expect(protectRuntimeLogRecord({ unknown: () => "unsafe" })).toEqual({ privacy: "withheld" });
    expect(
      protectRuntimeLogRecord(
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("unsafe");
            }
          }
        )
      )
    ).toEqual({ privacy: "withheld" });
    expect(
      protectRuntimeLogRecord({ req: null, res: "unsafe", fields: { password: "secret" } })
    ).toEqual({ req: {}, res: {}, fields: { password: "[REDACTED]" } });
  });

  it("creates a logger with bound runtime context", () => {
    const logger = createRuntimeLoggerFromEnv({
      app: "api",
      defaultService: "debugbundle-api",
      env: {
        DEBUGBUNDLE_LOG_LEVEL: "debug",
        NODE_ENV: "test"
      },
      version: "1.2.3"
    });

    expect(logger.level).toBe("debug");
    expect(logger.bindings()).toMatchObject({
      app: "api",
      environment: "test",
      service: "debugbundle-api",
      version: "1.2.3"
    });
  });
});
