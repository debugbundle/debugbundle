import { beforeEach, expect, it } from "vitest";
import {
  processNextNormalizeEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
  processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJobMock,
  resetWorkerRuntimeMocks
} from "../../helpers/worker-runtime-mocks.js";
import { runWorkerFromEnv } from "../../../apps/worker/src/runtime.js";

beforeEach(resetWorkerRuntimeMocks);

it("makes downstream progress in the same bounded pass while ingestion remains busy", async () => {
  processNextNormalizeEventsJobMock.mockResolvedValue({ processed: true });
  processNextGroupIncidentJobMock.mockResolvedValue({ processed: true });
  processNextBuildBundleJobMock.mockResolvedValue({ processed: true });
  await runWorkerFromEnv({ WORKER_RUN_ONCE: "1", ANALYTICS_HASH_SECRET: "test-secret" });
  expect(processNextNormalizeEventsJobMock).toHaveBeenCalledTimes(1);
  expect(processNextGroupIncidentJobMock).toHaveBeenCalledTimes(1);
  expect(processNextBuildBundleJobMock).toHaveBeenCalledTimes(1);
  expect(processNextBuildReproductionJobMock).toHaveBeenCalledTimes(1);
  expect(processNextEvaluateAlertsJobMock).toHaveBeenCalledTimes(1);
});
