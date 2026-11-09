import { Readable } from "node:stream";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { isObjectMissing } from "./object-store-errors.js";
const OptionsSchema = z
  .object({
    bucket: z.string().min(1),
    key: z.string().min(1).max(2048),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(16 * 1024 * 1024),
    timeoutMs: z.number().int().min(100).max(60_000).default(5000)
  })
  .strict();
/** A range caps transfer even before stream validation. The deadline covers
 * both headers and the body; a server's declared size is never trusted alone. */
export async function readBoundedS3Object(
  client: S3Client,
  raw: z.input<typeof OptionsSchema>
): Promise<Buffer> {
  const input = OptionsSchema.parse(raw),
    controller = new AbortController();
  let readable: Readable | undefined;
  const timer = setTimeout(() => {
    controller.abort();
    readable?.destroy(new Error("s3_read_timeout"));
  }, input.timeoutMs);
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Range: `bytes=0-${input.maxBytes}`
      }),
      { abortSignal: controller.signal }
    );
    if (controller.signal.aborted) {
      if (response.Body instanceof Readable) response.Body.destroy();
      throw new Error("s3_read_timeout");
    }
    const body = response.Body;
    if (body === undefined) throw new Error("s3_object_not_found");
    if (body instanceof Readable) readable = body;
    const total = response.ContentRange?.match(/\/(\d+)$/)?.[1];
    if (
      (response.ContentLength ?? 0) > input.maxBytes ||
      (total !== undefined && Number(total) > input.maxBytes)
    )
      throw new Error("s3_object_too_large");
    if (Buffer.isBuffer(body)) {
      if (body.byteLength > input.maxBytes) throw new Error("s3_object_too_large");
      return body;
    }
    if (!readable) throw new Error("unsupported_s3_body");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const rawChunk of readable) {
      const chunk: unknown = rawChunk;
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === "string"
          ? Buffer.from(chunk)
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk)
            : null;
      if (bytes === null) throw new Error("unsupported_s3_body");
      size += bytes.byteLength;
      if (size > input.maxBytes) throw new Error("s3_object_too_large");
      chunks.push(bytes);
    }
    if (controller.signal.aborted) throw new Error("s3_read_timeout");
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("s3_read_timeout");
    if (isObjectMissing(error)) throw new Error("s3_object_not_found");
    throw error;
  } finally {
    clearTimeout(timer);
    readable?.destroy();
  }
}
