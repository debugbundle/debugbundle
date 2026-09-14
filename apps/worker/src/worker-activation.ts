import { access } from "node:fs/promises";
import type { WorkerShutdownState } from "./worker-env.js";

export const WORKER_ACTIVATION_PATH = "/tmp/debugbundle-worker-activated";

export function createWorkerActivationState(
  staged: boolean,
  hasMarker: () => Promise<boolean> = () =>
    access(WORKER_ACTIVATION_PATH).then(
      () => true,
      () => false
    )
): { isActive(): boolean; wait(shutdown: WorkerShutdownState): Promise<void> } {
  let active = !staged;
  return {
    isActive: () => active,
    async wait(shutdown: WorkerShutdownState): Promise<void> {
      while (!active && !shutdown.isShuttingDown()) {
        if (await hasMarker()) {
          active = true;
          return;
        }
        await shutdown.waitForNextPoll(250);
      }
    }
  };
}
