export interface ObjectStorePutInput {
  key: string;
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
  timeoutMs?: number;
}

export interface ObjectStoreDeleteInput {
  key: string;
  timeoutMs?: number;
}

export interface ObjectStoreClient {
  putObject(input: ObjectStorePutInput): Promise<void>;
  deleteObject?(input: ObjectStoreDeleteInput): Promise<void>;
}

export interface ObjectStorePrefixDeleter {
  deleteObjectsByPrefix(prefix: string): Promise<void>;
}

export interface ObjectStoreReadInput {
  key: string;
  /** Opt-in bounds for report/context reads; omitted options preserve existing reads. */
  maxBytes?: number;
  timeoutMs?: number;
}

export interface ObjectStoreReader {
  getObject(input: ObjectStoreReadInput): Promise<Buffer>;
}
