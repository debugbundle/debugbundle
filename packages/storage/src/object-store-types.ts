export interface ObjectStorePutInput {
  key: string;
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
}

export interface ObjectStoreDeleteInput {
  key: string;
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
}

export interface ObjectStoreReader {
  getObject(input: ObjectStoreReadInput): Promise<Buffer>;
}
