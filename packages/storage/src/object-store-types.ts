export interface ObjectStorePutInput {
  key: string;
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
  signal?: AbortSignal;
}

export interface ObjectStoreDeleteInput {
  key: string;
  signal?: AbortSignal;
}

export interface ObjectStoreClient {
  putObject(input: ObjectStorePutInput): Promise<void>;
  deleteObject?(input: ObjectStoreDeleteInput): Promise<void>;
}

export interface ObjectStoreDeleter {
  deleteObject(input: ObjectStoreDeleteInput): Promise<void>;
}

export interface ObjectStoreBulkDeleter {
  deleteObjects(input: { keys: string[]; signal?: AbortSignal }): Promise<{
    deleted: string[];
    failed: string[];
  }>;
}

export interface ObjectStorePrefixDeleter {
  deleteObjectsByPrefix(prefix: string): Promise<void>;
}

export interface ObjectStoreReadInput {
  key: string;
  signal?: AbortSignal;
}

export interface ObjectStoreReader {
  getObject(input: ObjectStoreReadInput): Promise<Buffer>;
}

export interface ObjectStoreLister {
  listObjects(input: {
    prefix: string;
    startAfter?: string;
    maxKeys: number;
    signal?: AbortSignal;
  }): Promise<{
    objects: Array<{ key: string; lastModifiedAt: Date }>;
    hasMore: boolean;
  }>;
}
