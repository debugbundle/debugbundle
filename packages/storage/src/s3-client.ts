import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import type {
  CreateS3ObjectStoreClientInput,
  ObjectStoreClient,
  ObjectStoreBulkDeleter,
  ObjectStoreDeleter,
  ObjectStorePrefixDeleter,
  ObjectStorePutInput,
  ObjectStoreReadInput,
  ObjectStoreReader,
  ObjectStoreLister
} from "./types.js";

function toNodeBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return Promise.resolve(body);
  }

  if (body !== null && typeof body === "object" && "transformToByteArray" in body) {
    const transform = body.transformToByteArray as (() => Promise<Uint8Array>) | undefined;
    if (transform !== undefined) {
      return transform().then((value) => Buffer.from(value));
    }
  }

  throw new Error("unsupported_s3_body");
}

export function createS3ObjectStoreClient(
  input: CreateS3ObjectStoreClientInput
): ObjectStoreClient &
  ObjectStoreDeleter &
  ObjectStoreBulkDeleter &
  ObjectStoreReader &
  ObjectStorePrefixDeleter &
  ObjectStoreLister {
  const s3 = new S3Client({
    endpoint: input.endpoint,
    region: input.region,
    forcePathStyle: input.forcePathStyle ?? true,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    }
  });

  return {
    async putObject(request: ObjectStorePutInput): Promise<void> {
      const command = new PutObjectCommand({
        Bucket: input.bucket,
        Key: request.key,
        Body: request.body,
        ContentType: request.contentType,
        ContentEncoding: request.contentEncoding
      });
      if (request.signal === undefined) await s3.send(command);
      else await s3.send(command, { abortSignal: request.signal });
    },

    async deleteObject(request): Promise<void> {
      try {
        const command = new DeleteObjectCommand({ Bucket: input.bucket, Key: request.key });
        if (request.signal === undefined) await s3.send(command);
        else await s3.send(command, { abortSignal: request.signal });
      } catch (error) {
        const errorName =
          typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata
            ? Number(error.$metadata.httpStatusCode)
            : NaN;

        if (errorName === "NoSuchKey" || statusCode === 404) {
          return;
        }

        throw error;
      }
    },

    async deleteObjects(request) {
      const keys = request.keys;
      if (
        !Array.isArray(keys) ||
        keys.length < 1 ||
        keys.length > 1000 ||
        keys.some(
          (key) =>
            typeof key !== "string" ||
            Buffer.byteLength(key, "utf8") < 1 ||
            Buffer.byteLength(key, "utf8") > 1024
        ) ||
        new Set(keys).size !== keys.length
      )
        throw new Error("s3_object_deletion_invalid");
      const command = new DeleteObjectsCommand({
        Bucket: input.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false }
      });
      const response =
        request.signal === undefined
          ? await s3.send(command)
          : await s3.send(command, { abortSignal: request.signal });
      const deletedRows = response.Deleted ?? [];
      const errorRows = response.Errors ?? [];
      if (!Array.isArray(deletedRows) || !Array.isArray(errorRows))
        throw new Error("s3_object_deletion_response_invalid");
      const deleted = new Set(deletedRows.map((row) => row.Key));
      const failed = new Set(errorRows.map((row) => row.Key));
      if (
        deleted.size !== deletedRows.length ||
        failed.size !== errorRows.length ||
        [...deleted, ...failed].some((key) => !keys.includes(key ?? "")) ||
        keys.some((key) => deleted.has(key) === failed.has(key))
      )
        throw new Error("s3_object_deletion_response_invalid");
      return {
        deleted: keys.filter((key) => deleted.has(key)),
        failed: keys.filter((key) => failed.has(key))
      };
    },

    async deleteObjectsByPrefix(prefix: string): Promise<void> {
      let continuationToken: string | undefined;

      do {
        const listResult = await s3.send(
          new ListObjectsV2Command({
            Bucket: input.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken
          })
        );

        const keys = (listResult.Contents ?? [])
          .map((obj) => obj.Key)
          .filter((key): key is string => key !== undefined);

        if (keys.length > 0) {
          const deletion = await s3.send(
            new DeleteObjectsCommand({
              Bucket: input.bucket,
              Delete: {
                Objects: keys.map((key) => ({ Key: key })),
                Quiet: true
              }
            })
          );
          // DeleteObjects can return HTTP success while individual keys failed.
          // Project erasure must stay retryable rather than claiming completion.
          if (deletion?.Errors?.length) throw new Error("s3_object_deletion_incomplete");
        }

        continuationToken =
          listResult.IsTruncated === true ? listResult.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
    },

    async listObjects(request) {
      if (
        Buffer.byteLength(request.prefix, "utf8") === 0 ||
        Buffer.byteLength(request.prefix, "utf8") > 1024 ||
        !Number.isInteger(request.maxKeys) ||
        request.maxKeys < 1 ||
        request.maxKeys > 1000 ||
        (request.startAfter !== undefined && Buffer.byteLength(request.startAfter, "utf8") > 1024)
      )
        throw new Error("s3_object_listing_invalid");
      const command = new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: request.prefix,
        MaxKeys: request.maxKeys,
        ...(request.startAfter === undefined ? {} : { StartAfter: request.startAfter })
      });
      const response =
        request.signal === undefined
          ? await s3.send(command)
          : await s3.send(command, { abortSignal: request.signal });
      const objects = (response.Contents ?? []).map((entry) => {
        if (
          typeof entry.Key !== "string" ||
          !entry.Key.startsWith(request.prefix) ||
          (request.startAfter !== undefined && entry.Key <= request.startAfter) ||
          !(entry.LastModified instanceof Date) ||
          !Number.isFinite(entry.LastModified.getTime())
        )
          throw new Error("s3_object_listing_invalid");
        return { key: entry.Key, lastModifiedAt: entry.LastModified };
      });
      if (response.IsTruncated === true && objects.length === 0)
        throw new Error("s3_object_listing_invalid");
      return { objects, hasMore: response.IsTruncated === true };
    },

    async getObject(request: ObjectStoreReadInput): Promise<Buffer> {
      let response;
      try {
        const command = new GetObjectCommand({
          Bucket: input.bucket,
          Key: request.key
        });
        response =
          request.signal === undefined
            ? await s3.send(command)
            : await s3.send(command, { abortSignal: request.signal });
      } catch (error) {
        const errorName =
          typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata
            ? Number(error.$metadata.httpStatusCode)
            : NaN;

        if (errorName === "NoSuchKey" || statusCode === 404) {
          throw new Error("s3_object_not_found");
        }

        throw error;
      }

      if (response.Body === undefined) {
        throw new Error("s3_object_not_found");
      }

      return toNodeBuffer(response.Body);
    }
  };
}
