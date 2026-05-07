import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function flushEntrypoint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const { runWorkerFromEnvMock } = vi.hoisted(() => ({
  runWorkerFromEnvMock: vi.fn<(env?: NodeJS.ProcessEnv) => Promise<void>>()
}));

const { workerLoggerMock } = vi.hoisted(() => ({
  workerLoggerMock: {
    fatal: vi.fn()
  }
}));

vi.mock("../../../apps/worker/src/runtime.js", () => ({
  runWorkerFromEnv: runWorkerFromEnvMock
}));

vi.mock("../../../packages/runtime-logger/src/index.js", () => ({
  createRuntimeLoggerFromEnv: vi.fn(() => workerLoggerMock),
  getErrorMessage: vi.fn((error: unknown, fallback: string) => error instanceof Error ? error.message : fallback)
}));

describe("worker main entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    runWorkerFromEnvMock.mockReset();
    workerLoggerMock.fatal.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start worker runtime from process env", async (): Promise<void> => {
    runWorkerFromEnvMock.mockResolvedValueOnce(undefined);

    await import("../../../apps/worker/src/main.js");

    await flushEntrypoint();
    expect(runWorkerFromEnvMock).toHaveBeenCalledWith(process.env);
  });

  it("should log startup error and exit with code 1", async (): Promise<void> => {
    runWorkerFromEnvMock.mockRejectedValueOnce(new Error("failed to start"));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../../../apps/worker/src/main.js");

    await flushEntrypoint();
    expect(workerLoggerMock.fatal).toHaveBeenCalledWith(
      { error_message: "failed to start" },
      "worker_startup_failed"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should log unknown worker error for non-Error rejection", async (): Promise<void> => {
    runWorkerFromEnvMock.mockRejectedValueOnce(null);

    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../../../apps/worker/src/main.js");

    await flushEntrypoint();
    expect(workerLoggerMock.fatal).toHaveBeenCalledWith(
      { error_message: "unknown_worker_error" },
      "worker_startup_failed"
    );
  });
});
