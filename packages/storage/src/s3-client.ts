import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type {
  CreateS3ObjectStoreClientInput,
  ObjectStoreClient,
  ObjectStorePrefixDeleter,
  ObjectStorePutInput,
  ObjectStoreReadInput,
  ObjectStoreReader,
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
): ObjectStoreClient & ObjectStoreReader & ObjectStorePrefixDeleter {
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
      await s3.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: request.key,
          Body: request.body,
          ContentType: request.contentType,
          ContentEncoding: request.contentEncoding
        })
      );
    },

    async deleteObject(request): Promise<void> {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: input.bucket,
            Key: request.key
          })
        );
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
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: input.bucket,
              Delete: {
                Objects: keys.map((key) => ({ Key: key })),
                Quiet: true
              }
            })
          );
        }

        continuationToken = listResult.IsTruncated === true ? listResult.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
    },

    async getObject(request: ObjectStoreReadInput): Promise<Buffer> {
      let response;
      try {
        response = await s3.send(
          new GetObjectCommand({
            Bucket: input.bucket,
            Key: request.key
          })
        );
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
