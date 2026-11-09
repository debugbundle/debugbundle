import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: class {
      send = send;
    }
  };
});
import { createS3ObjectStoreClient } from "../../../packages/storage/src/s3-client.js";
const store = () =>
  createS3ObjectStoreClient({
    endpoint: "http://example.test",
    region: "test",
    bucket: "bundles",
    accessKeyId: "test",
    secretAccessKey: "test"
  });
afterEach(() => {
  send.mockReset();
  vi.useRealTimers();
});
it("opts into a bounded range and streams only a small retained object", async () => {
  send.mockResolvedValue({
    Body: Readable.from([Buffer.from("safe")]),
    ContentLength: 4,
    ContentRange: "bytes 0-3/4"
  });
  const result = await store().getObject({
    key: "bundles/source/bundle.json.gz",
    maxBytes: 8,
    timeoutMs: 1000
  });
  expect(result.toString()).toBe("safe");
  const command = send.mock.calls[0]?.[0] as { input: { Range?: string } };
  expect(command.input.Range).toBe("bytes=0-8");
});
it("rejects oversized metadata or a stream that exceeds its declared size and closes the body", async () => {
  const oversized = Readable.from([Buffer.alloc(20)]);
  send.mockResolvedValueOnce({ Body: oversized, ContentLength: 20 });
  await expect(store().getObject({ key: "bundle", maxBytes: 8, timeoutMs: 1000 })).rejects.toThrow(
    "s3_object_too_large"
  );
  expect(oversized.destroyed).toBe(true);
  const dishonest = Readable.from([Buffer.alloc(5), Buffer.alloc(5)]);
  send.mockResolvedValueOnce({ Body: dishonest, ContentLength: 5 });
  await expect(store().getObject({ key: "bundle", maxBytes: 8, timeoutMs: 1000 })).rejects.toThrow(
    "s3_object_too_large"
  );
  expect(dishonest.destroyed).toBe(true);
});
it("aborts a stalled bounded read at its deadline", async () => {
  vi.useFakeTimers();
  send.mockImplementation(
    (_command: unknown, options: { abortSignal: AbortSignal }) =>
      new Promise((_resolve, reject) =>
        options.abortSignal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true
        })
      )
  );
  const pending = expect(
    store().getObject({ key: "bundle", maxBytes: 8, timeoutMs: 100 })
  ).rejects.toThrow("s3_read_timeout");
  await vi.advanceTimersByTimeAsync(100);
  await pending;
});
it("keeps ordinary existing reads unchanged and validates bounded options before requesting", async () => {
  send.mockResolvedValue({ Body: Buffer.from("legacy") });
  expect((await store().getObject({ key: "bundle" })).toString()).toBe("legacy");
  const command = send.mock.calls[0]?.[0] as { input: { Range?: string } };
  expect(command.input.Range).toBeUndefined();
  await expect(
    store().getObject({ key: "bundle", maxBytes: 0, timeoutMs: 1000 })
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
});
