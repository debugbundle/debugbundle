import { expect, it, vi } from "vitest";
import {
  processNextNormalizeEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
  queueAcquireLeaseMock,
  poolEndMock,
  resetWorkerRuntimeMocks
} from "../../helpers/worker-runtime-mocks.js";

const { markerAccess } = vi.hoisted(() => ({ markerAccess: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  access: markerAccess
}));

import { runWorkerFromEnv } from "../../../apps/worker/src/runtime.js";
import { WORKER_ACTIVATION_PATH } from "../../../apps/worker/src/worker-activation.js";

it("does not start processing from a paused environment until its marker is available", async () => {
  resetWorkerRuntimeMocks();
  let markerObserved = false;
  let releaseMarker: () => void = () => undefined;
  const markerAvailable = new Promise<void>((resolve) => {
    releaseMarker = resolve;
  });
  markerAccess.mockImplementation(async (path: string) => {
    expect(path).toBe(WORKER_ACTIVATION_PATH);
    markerObserved = true;
    await markerAvailable;
  });

  const worker = runWorkerFromEnv({
    WORKER_START_PAUSED: "1",
    WORKER_RUN_ONCE: "1",
    ANALYTICS_HASH_SECRET: "test-analytics-secret"
  });
  try {
    await vi.waitFor(() => expect(markerObserved).toBe(true));
    expect(processNextNormalizeEventsJobMock).not.toHaveBeenCalled();
    expect(processNextGroupIncidentJobMock).not.toHaveBeenCalled();
    expect(processNextBuildBundleJobMock).not.toHaveBeenCalled();
    expect(queueAcquireLeaseMock).not.toHaveBeenCalled();
    // Readiness closes its temporary startup pool; the processing pool stays open.
    expect(poolEndMock).toHaveBeenCalledOnce();
  } finally {
    releaseMarker();
    await worker;
  }
  expect(processNextNormalizeEventsJobMock).toHaveBeenCalledOnce();
  expect(poolEndMock).toHaveBeenCalledTimes(2);
});
