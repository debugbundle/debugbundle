import { expect, it, vi } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import {
  createWorkerActivationState,
  WORKER_ACTIVATION_PATH
} from "../../../apps/worker/src/worker-activation.js";
import { createWorkerShutdownState } from "../../../apps/worker/src/worker-env.js";

it("keeps a staged worker idle until activation and lets shutdown cancel the wait", async () => {
  const shutdown = createWorkerShutdownState();
  const state = createWorkerActivationState(true, async () => false);
  const ready = vi.fn();
  const waiting = state.wait(shutdown).then(ready);
  await Promise.resolve();
  expect(state.isActive()).toBe(false);
  expect(ready).not.toHaveBeenCalled();
  shutdown.requestShutdown();
  await waiting;
  expect(state.isActive()).toBe(false);
});

it("activates after the release marker exists and leaves ordinary self-host startup immediate", async () => {
  const staged = createWorkerActivationState(true, async () => true);
  await staged.wait(createWorkerShutdownState());
  expect(staged.isActive()).toBe(true);
  expect(createWorkerActivationState(false).isActive()).toBe(true);
});

it("uses the real container activation marker and leaves a missing marker paused", async () => {
  const shutdown = createWorkerShutdownState();
  const missing = createWorkerActivationState(true);
  const waiting = missing.wait(shutdown);
  shutdown.requestShutdown();
  await waiting;
  expect(missing.isActive()).toBe(false);

  // Exclusive creation preserves any unexpected existing file; cleanup only removes our marker.
  await writeFile(WORKER_ACTIVATION_PATH, "test-only", { flag: "wx" });
  try {
    const present = createWorkerActivationState(true);
    await present.wait(createWorkerShutdownState());
    expect(present.isActive()).toBe(true);
  } finally {
    await unlink(WORKER_ACTIVATION_PATH);
  }
});
