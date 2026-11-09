import { beforeEach, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const original = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...original,
    S3Client: class {
      send = send;
    }
  };
});
import { createS3ObjectStoreClient } from "../../../packages/storage/src/s3-client.js";
const store = () =>
  createS3ObjectStoreClient({
    endpoint: "http://storage.invalid",
    region: "us-east-1",
    bucket: "test",
    accessKeyId: "synthetic",
    secretAccessKey: "synthetic"
  });
beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({});
});
it("preserves the existing unbounded call shape when deadlines are omitted", async () => {
  const objects = store();
  await objects.putObject({ key: "legacy", body: Buffer.from("body"), contentType: "text/plain" });
  await objects.deleteObject!({ key: "legacy" });
  expect(send.mock.calls.every((call) => call.length === 1)).toBe(true);
});
it.each(["put", "delete"] as const)(
  "aborts a bounded %s through the SDK signal without a detached background request",
  async (kind) => {
    send.mockImplementation(
      (_command, options: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) =>
          options.abortSignal.addEventListener(
            "abort",
            () => reject(new Error("test_storage_aborted")),
            { once: true }
          )
        )
    );
    const objects = store(),
      started = Date.now();
    const result =
      kind === "put"
        ? objects.putObject({
            key: "report",
            body: Buffer.from("body"),
            contentType: "application/json",
            timeoutMs: 100
          })
        : objects.deleteObject!({ key: "report", timeoutMs: 100 });
    await expect(result).rejects.toThrow("test_storage_aborted");
    expect(Date.now() - started).toBeLessThan(1500);
    expect(send).toHaveBeenCalledTimes(1);
  }
);
it("validates mutation deadlines before sending", async () => {
  await expect(
    store().putObject({
      key: "report",
      body: Buffer.from("body"),
      contentType: "application/json",
      timeoutMs: 0
    })
  ).rejects.toThrow();
  await expect(store().deleteObject!({ key: "report", timeoutMs: 60001 })).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
