import { expect, it } from "vitest";
import { WorkerJobOperatorEnvSchema } from "../../scripts/worker-jobs.js";

const scope = {
  DB_PASSWORD: "test-only",
  WORKER_JOB_PROJECT_ID: "12aceed0-0d01-4d13-ae3b-e1c1c560f18b"
};
it("defaults to inspection and requires an exact project and job for retries", () => {
  expect(WorkerJobOperatorEnvSchema.parse(scope).WORKER_JOB_RETRY).toBe("0");
  expect(
    WorkerJobOperatorEnvSchema.safeParse({ ...scope, WORKER_JOB_PROJECT_ID: "global" }).success
  ).toBe(true);
  expect(WorkerJobOperatorEnvSchema.safeParse({ ...scope, WORKER_JOB_RETRY: "1" }).success).toBe(
    false
  );
  expect(
    WorkerJobOperatorEnvSchema.safeParse({
      ...scope,
      WORKER_JOB_RETRY: "1",
      WORKER_JOB_ID: "a".repeat(64)
    }).success
  ).toBe(true);
  expect(
    WorkerJobOperatorEnvSchema.safeParse({ ...scope, WORKER_JOB_PROJECT_ID: "all" }).success
  ).toBe(false);
  expect(
    WorkerJobOperatorEnvSchema.safeParse({ ...scope, WORKER_JOB_ID: "arbitrary SQL" }).success
  ).toBe(false);
});
