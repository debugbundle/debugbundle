import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkerShutdownState,
  delayUntilNextPollOrShutdown
} from "../../../apps/worker/src/worker-env.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("worker poll lifecycle", () => {
  it("releases each elapsed poll without accumulating shutdown waits", async () => {
    vi.useFakeTimers();
    const state = createWorkerShutdownState();
    const shutdownWait = vi.spyOn(state, "waitForShutdown");

    for (let index = 0; index < 100; index++) {
      const poll = delayUntilNextPollOrShutdown(250, state);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(250);
      await poll;
      expect(vi.getTimerCount()).toBe(0);
    }

    // Repeated races against a process-lifetime promise retain reactions until shutdown.
    expect(shutdownWait).not.toHaveBeenCalled();
    expect(state.isShuttingDown()).toBe(false);
    state.requestShutdown();
  });

  it("interrupts both polling lanes and clears their outstanding timers", async () => {
    vi.useFakeTimers();
    const state = createWorkerShutdownState();
    const mainPoll = delayUntilNextPollOrShutdown(60_000, state);
    const availabilityPoll = delayUntilNextPollOrShutdown(250, state);
    const shutdown = state.waitForShutdown();
    expect(vi.getTimerCount()).toBe(2);

    state.requestShutdown();
    state.requestShutdown();

    await Promise.all([mainPoll, availabilityPoll, shutdown]);
    expect(vi.getTimerCount()).toBe(0);
    await expect(state.readinessCheck(vi.fn())).rejects.toThrow("worker_draining");
  });

  it("does not register timers once shutdown has started", async () => {
    vi.useFakeTimers();
    const state = createWorkerShutdownState();
    state.requestShutdown();

    await delayUntilNextPollOrShutdown(60_000, state);
    await state.waitForShutdown();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps concurrent polls independent and tolerates shutdown after a timeout", async () => {
    vi.useFakeTimers();
    const state = createWorkerShutdownState();
    const shortPoll = delayUntilNextPollOrShutdown(250, state);
    const longPoll = delayUntilNextPollOrShutdown(1000, state);

    await vi.advanceTimersByTimeAsync(250);
    await shortPoll;
    expect(vi.getTimerCount()).toBe(1);

    state.requestShutdown();
    await longPoll;
    expect(vi.getTimerCount()).toBe(0);
  });
});
