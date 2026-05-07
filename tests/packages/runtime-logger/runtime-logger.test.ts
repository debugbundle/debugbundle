import { describe, expect, it } from "vitest";

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

    expect(resolveRuntimeService({ DEBUGBUNDLE_LOG_SERVICE: "api-edge" }, "debugbundle-api")).toBe("api-edge");
  });

  it("falls back to safe defaults for invalid log levels and unknown errors", () => {
    expect(resolveRuntimeLogLevel({ DEBUGBUNDLE_LOG_LEVEL: "verbose" })).toBe("info");
    expect(getErrorMessage("oops", "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
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