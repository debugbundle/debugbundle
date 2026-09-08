import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startApiEventLoopEvidence,
  startHostedMcpEventLoopEvidence
} from "../../../apps/api/src/event-loop-evidence.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true }))
  );
});

describe("api event-loop capacity evidence", () => {
  it("starts only for a hosted MCP process", () => {
    const recorder = { writeSample: vi.fn(), stop: vi.fn() };
    const start = vi.fn().mockReturnValue(recorder);

    expect(startHostedMcpEventLoopEvidence(false, start)).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
    expect(startHostedMcpEventLoopEvidence(true, start)).toBe(recorder);
    expect(start).toHaveBeenCalledOnce();
  });

  it("atomically overwrites a bounded host-local p95 sample and stops cleanly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debugbundle-event-loop-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "event-loop.json");
    const enable = vi.fn();
    const disable = vi.fn();
    const unref = vi.fn();
    const clearIntervalImpl = vi.fn();
    const intervalHandle = { unref } as unknown as NodeJS.Timeout;
    const setIntervalImpl = vi.fn().mockReturnValue(intervalHandle);
    const recorder = startApiEventLoopEvidence({
      filePath,
      now: () => new Date("2026-09-08T09:30:00.000Z"),
      histogram: {
        enable,
        disable,
        percentile: vi.fn().mockReturnValue(42_750_000)
      },
      setIntervalImpl,
      clearIntervalImpl
    });

    await recorder.writeSample();

    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      schema_version: "1.0.0",
      sampled_at: "2026-09-08T09:30:00.000Z",
      event_loop_lag_p95_ms: 42.75
    });
    expect(enable).toHaveBeenCalledOnce();
    expect(setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(unref).toHaveBeenCalledOnce();

    recorder.stop();

    expect(clearIntervalImpl).toHaveBeenCalledWith(intervalHandle);
    expect(disable).toHaveBeenCalledOnce();
  });
});
