import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, destroy } = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn()
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: vi.fn(function () {
      return { send, destroy };
    })
  };
});

import { assertS3BucketReady, parseApiRuntimeEnv } from "../../apps/api/src/runtime.js";
import { assertWorkerS3BucketReady, parseWorkerEnv } from "../../apps/worker/src/worker-env.js";

const environment = {
  ANALYTICS_HASH_SECRET: "test-analytics-secret",
  DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret"
};

describe.each([
  ["API", () => assertS3BucketReady(parseApiRuntimeEnv(environment))],
  ["worker", () => assertWorkerS3BucketReady(parseWorkerEnv(environment))]
] as const)("%s readiness client resources", (_name, check) => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    destroy.mockClear();
  });

  it("destroys temporary S3 clients after every successful probe", async () => {
    await check();
    await check();
    expect(send).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("destroys the client on failure without hiding the readiness error", async () => {
    const failure = new Error("synthetic_s3_unavailable");
    send.mockRejectedValueOnce(failure);
    await expect(check()).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
