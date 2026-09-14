import { expect, it, vi } from "vitest";
import { createWorkerShutdownState } from "../../../apps/worker/src/worker-env.js";
import { runWorkerLane } from "../../../apps/worker/src/worker-steps.js";

it("continues incident processing while the independent delivery lane waits for a provider", async () => {
  const shutdown = createWorkerShutdownState();
  let finishDelivery!: () => void;
  const delivery = new Promise<void>((resolve) => {
    finishDelivery = resolve;
  });
  let incidentPasses = 0;
  const logger = { error: vi.fn() };
  const blocked = runWorkerLane({
    logger: logger as never,
    name: "delivery",
    shutdown,
    idleIntervalMs: 1,
    async processPass() {
      await delivery;
      return { processed: true };
    }
  });
  await runWorkerLane({
    logger: logger as never,
    name: "incidents",
    shutdown,
    idleIntervalMs: 1,
    async processPass() {
      incidentPasses++;
      if (incidentPasses === 3) {
        shutdown.requestShutdown();
        finishDelivery();
      }
      return { processed: true };
    }
  });
  await blocked;
  expect(incidentPasses).toBe(3);
  expect(logger.error).not.toHaveBeenCalled();
});
