import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function flushEntrypoint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const { startApiServerFromEnvMock } = vi.hoisted(() => ({
  startApiServerFromEnvMock: vi.fn<(env?: NodeJS.ProcessEnv) => Promise<void>>()
}));

const { apiLoggerMock } = vi.hoisted(() => ({
  apiLoggerMock: {
    fatal: vi.fn()
  }
}));

vi.mock("../../../apps/api/src/runtime.js", () => ({
  startApiServerFromEnv: startApiServerFromEnvMock
}));

vi.mock("../../../packages/runtime-logger/src/index.js", () => ({
  createRuntimeLoggerFromEnv: vi.fn(() => apiLoggerMock),
  getErrorMessage: vi.fn((error: unknown, fallback: string) => error instanceof Error ? error.message : fallback)
}));

describe("api main entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    startApiServerFromEnvMock.mockReset();
    apiLoggerMock.fatal.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start runtime from process env", async (): Promise<void> => {
    startApiServerFromEnvMock.mockResolvedValueOnce(undefined);

    await import("../../../apps/api/src/main.js");

    await flushEntrypoint();
    expect(startApiServerFromEnvMock).toHaveBeenCalledWith(process.env);
  });

  it("should log startup error and exit with code 1", async (): Promise<void> => {
    startApiServerFromEnvMock.mockRejectedValueOnce(new Error("boom"));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../../../apps/api/src/main.js");

    await flushEntrypoint();
    expect(apiLoggerMock.fatal).toHaveBeenCalledWith({ error_message: "boom" }, "api_startup_failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should log unknown startup error for non-Error rejection", async (): Promise<void> => {
    startApiServerFromEnvMock.mockRejectedValueOnce("oops");

    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../../../apps/api/src/main.js");

    await flushEntrypoint();
    expect(apiLoggerMock.fatal).toHaveBeenCalledWith(
      { error_message: "unknown_startup_error" },
      "api_startup_failed"
    );
  });
});
