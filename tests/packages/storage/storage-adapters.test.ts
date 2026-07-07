import { beforeEach, describe, expect, it, vi } from "vitest";

let sendMock = vi.fn();
let redisRpushMock = vi.fn();
let redisLrangeMock = vi.fn();
let redisDelMock = vi.fn();
let redisLpopMock = vi.fn();
let redisSetMock = vi.fn();
let redisQuitMock = vi.fn();
let redisMultiMock = vi.fn();
let redisEvalMock = vi.fn();
let redisZrangebyscoreMock = vi.fn();
let redisZremMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }

  class PutObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class ListObjectsV2Command {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class DeleteObjectsCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand
  };
});

vi.mock("ioredis", () => {
  class Redis {
    rpush = redisRpushMock;
    lrange = redisLrangeMock;
    del = redisDelMock;
    lpop = redisLpopMock;
    set = redisSetMock;
    quit = redisQuitMock;
    multi = redisMultiMock;
    eval = redisEvalMock;
    zrangebyscore = redisZrangebyscoreMock;
    zrem = redisZremMock;

    constructor() {}
  }

  return {
    Redis
  };
});

import {
  createRedisIncidentFrequencyCounter,
  createRedisQueueClient,
  createRedisRequestAnomalyCounter,
  createS3ObjectStoreClient
} from "../../../packages/storage/src/index.js";

describe("storage adapters", () => {
  beforeEach(() => {
    sendMock = vi.fn();
    redisRpushMock = vi.fn().mockResolvedValue(1);
    redisLrangeMock = vi.fn().mockResolvedValue(["{\"event_id\":\"e1\"}"]);
    redisDelMock = vi.fn().mockResolvedValue(1);
    redisLpopMock = vi.fn().mockResolvedValue('{"project_id":"proj_123","event_id":"evt_123","object_key":"raw-events/proj_123/e.json.gz"}');
    redisSetMock = vi.fn().mockResolvedValue("OK");
    redisQuitMock = vi.fn().mockResolvedValue("OK");
    redisMultiMock = vi.fn();
    redisEvalMock = vi.fn().mockResolvedValue(null);
    redisZrangebyscoreMock = vi.fn().mockResolvedValue([]);
    redisZremMock = vi.fn().mockResolvedValue(1);
  });

  it("should put and get objects with S3 adapter", async (): Promise<void> => {
    sendMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async (): Promise<Uint8Array> => {
            await Promise.resolve();
            return new Uint8Array(Buffer.from("hello", "utf8"));
          }
        }
      });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await client.putObject({
      key: "raw-events/proj/e.json.gz",
      body: Buffer.from("x", "utf8"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    const body = await client.getObject({ key: "raw-events/proj/e.json.gz" });

    expect(body.toString("utf8")).toBe("hello");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("should delete objects with S3 adapter", async (): Promise<void> => {
    sendMock.mockResolvedValue(undefined);

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await client.deleteObject!({ key: "raw-events/proj/e.json.gz" });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("should delete all objects under a prefix with deleteObjectsByPrefix", async (): Promise<void> => {
    sendMock
      .mockResolvedValueOnce({
        Contents: [{ Key: "raw-events/proj_1/2026/03/21/00/a.json.gz" }, { Key: "raw-events/proj_1/2026/03/21/00/b.json.gz" }],
        IsTruncated: false
      })
      .mockResolvedValueOnce(undefined);

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await client.deleteObjectsByPrefix("raw-events/proj_1/");

    expect(sendMock).toHaveBeenCalledTimes(2);
    const deleteCall = sendMock.mock.calls[1]![0] as { input: { Delete: { Objects: Array<{ Key: string }>; Quiet: boolean } } };
    expect(deleteCall.input.Delete.Objects).toEqual([
      { Key: "raw-events/proj_1/2026/03/21/00/a.json.gz" },
      { Key: "raw-events/proj_1/2026/03/21/00/b.json.gz" }
    ]);
    expect(deleteCall.input.Delete.Quiet).toBe(true);
  });

  it("should paginate through large prefix listings", async (): Promise<void> => {
    sendMock
      .mockResolvedValueOnce({
        Contents: [{ Key: "bundles/proj_1/inc_1/bundle.json.gz" }],
        IsTruncated: true,
        NextContinuationToken: "page2"
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        Contents: [{ Key: "bundles/proj_1/inc_2/bundle.json.gz" }],
        IsTruncated: false
      })
      .mockResolvedValueOnce(undefined);

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await client.deleteObjectsByPrefix("bundles/proj_1/");

    expect(sendMock).toHaveBeenCalledTimes(4);
    const secondListCall = sendMock.mock.calls[2]![0] as { input: { ContinuationToken: string } };
    expect(secondListCall.input.ContinuationToken).toBe("page2");
  });

  it("should skip delete when prefix listing is empty", async (): Promise<void> => {
    sendMock.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await client.deleteObjectsByPrefix("raw-events/nonexistent/");

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("should throw when S3 get returns no body", async (): Promise<void> => {
    sendMock.mockResolvedValue({});

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await expect(client.getObject({ key: "missing" })).rejects.toThrow("s3_object_not_found");
  });

  it("should normalize S3 NoSuchKey errors to s3_object_not_found", async (): Promise<void> => {
    sendMock.mockRejectedValue({
      name: "NoSuchKey",
      $metadata: {
        httpStatusCode: 404
      }
    });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await expect(client.getObject({ key: "missing" })).rejects.toThrow("s3_object_not_found");
  });

  it("should read raw Buffer body responses from S3", async (): Promise<void> => {
    sendMock.mockResolvedValue({
      Body: Buffer.from("raw-buffer", "utf8")
    });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    const body = await client.getObject({ key: "raw-events/proj/e.json.gz" });
    expect(body.toString("utf8")).toBe("raw-buffer");
  });

  it("should map 404 metadata errors to s3_object_not_found even without NoSuchKey name", async (): Promise<void> => {
    sendMock.mockRejectedValue({
      name: "AccessDenied",
      $metadata: {
        httpStatusCode: 404
      }
    });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await expect(client.getObject({ key: "missing" })).rejects.toThrow("s3_object_not_found");
  });

  it("should rethrow non-notfound S3 errors", async (): Promise<void> => {
    sendMock.mockRejectedValue(new Error("s3_throttled"));

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await expect(client.getObject({ key: "raw-events/proj/e.json.gz" })).rejects.toThrow("s3_throttled");
  });

  it("should throw unsupported_s3_body when body stream does not expose transformToByteArray", async (): Promise<void> => {
    sendMock.mockResolvedValue({
      Body: {
        unexpected: true
      }
    });

    const client = createS3ObjectStoreClient({
      endpoint: "http://localstack:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    await expect(client.getObject({ key: "raw-events/proj/e.json.gz" })).rejects.toThrow("unsupported_s3_body");
  });

  it("should enqueue and read/clear Redis queue", async (): Promise<void> => {
    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });

    await queue.enqueue("normalize-events", {
      project_id: "proj_123",
      event_id: "evt_123",
      object_key: "raw-events/proj_123/e.json.gz"
    });

    const jobs = await queue.readJobQueue("normalize-events");
    const next = await queue.dequeue("normalize-events");
    await queue.clearJobQueue("normalize-events");
    await queue.close();

    expect(jobs).toHaveLength(1);
    expect(next?.object_key).toContain("raw-events/proj_123/");
    expect(redisRpushMock).toHaveBeenCalledOnce();
    expect(redisLrangeMock).toHaveBeenCalledOnce();
    expect(redisLpopMock).toHaveBeenCalledOnce();
    expect(redisDelMock).toHaveBeenCalledWith("jobs:normalize-events", "jobs:normalize-events:processing");
    expect(redisQuitMock).toHaveBeenCalledOnce();
  });

  it("should enqueue and dequeue deliver-webhook jobs", async (): Promise<void> => {
    redisLpopMock = vi.fn().mockResolvedValue('{"delivery_id":"del_123","attempt":2}');

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });

    await queue.enqueue("deliver-webhook", {
      delivery_id: "del_123",
      attempt: 1
    });

    const next = await queue.dequeue("deliver-webhook");

    expect(next).toEqual({
      delivery_id: "del_123",
      attempt: 2
    });
  });

  it("should enqueue and dequeue aggregate analytics jobs", async (): Promise<void> => {
    redisLpopMock = vi.fn().mockResolvedValue(
      '{"project_id":"proj_123","event_id":"550e8400-e29b-41d4-a716-446655440000","object_key":"analytics-events/proj_123/e.json.gz"}'
    );

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });
    const analyticsQueue = queue as typeof queue & {
      enqueue(jobName: "aggregate-analytics-events", payload: {
        project_id: string;
        event_id: string;
        object_key: string;
      }): Promise<void>;
      dequeue(jobName: "aggregate-analytics-events"): Promise<{
        project_id: string;
        event_id: string;
        object_key: string;
      } | null>;
    };

    await analyticsQueue.enqueue("aggregate-analytics-events", {
      project_id: "proj_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      object_key: "analytics-events/proj_123/e.json.gz"
    });

    const next = await analyticsQueue.dequeue("aggregate-analytics-events");

    expect(next).toEqual({
      project_id: "proj_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      object_key: "analytics-events/proj_123/e.json.gz"
    });
  });

  it("should enqueue and dequeue evaluate-alerts jobs", async (): Promise<void> => {
    redisLpopMock = vi.fn().mockResolvedValue(
      '{"project_id":"proj_123","incident_id":"inc_123","condition_type":"new_incident","dedupe_key":"new_incident","occurred_at":"2026-03-15T12:00:00.000Z","service_name":"checkout-api","environment":"production","severity":"high"}'
    );

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });

    await queue.enqueue("evaluate-alerts", {
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      occurred_at: "2026-03-15T12:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    const next = await queue.dequeue("evaluate-alerts");

    expect(next).toEqual({
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      occurred_at: "2026-03-15T12:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });
  });

  it("should enqueue and dequeue generate-weekly-report jobs", async (): Promise<void> => {
    redisLpopMock = vi.fn().mockResolvedValue(
      '{"delivery_id":"wrd_123","weekly_report_channel_id":"wr_123","project_id":"proj_123","window_start":"2026-03-09T00:00:00.000Z","window_end":"2026-03-16T00:00:00.000Z"}'
    );

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });

    await queue.enqueue("generate-weekly-report", {
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });

    const next = await queue.dequeue("generate-weekly-report");

    expect(next).toEqual({
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
  });

  it("should enqueue cleanup-retention jobs and manage queue leases", async (): Promise<void> => {
    redisLpopMock = vi.fn().mockResolvedValue('{"scheduled_at":"2026-04-04T12:00:00.000Z"}');

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });

    await queue.enqueue("cleanup-retention", {
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    const jobs = await queue.readJobQueue("cleanup-retention");
    const next = await queue.dequeue("cleanup-retention");
    const acquired = await queue.acquireLease("leases:cleanup-retention:schedule", 3600);
    await queue.releaseLease("leases:cleanup-retention:schedule");
    await queue.clearJobQueue("cleanup-retention");

    expect(jobs).toHaveLength(1);
    expect(next).toEqual({ scheduled_at: "2026-04-04T12:00:00.000Z" });
    expect(acquired).toBe(true);
    expect(redisSetMock).toHaveBeenCalledWith("leases:cleanup-retention:schedule", "1", "EX", 3600, "NX");
    expect(redisDelMock).toHaveBeenCalledWith("leases:cleanup-retention:schedule");
    expect(redisDelMock).toHaveBeenCalledWith("jobs:cleanup-retention", "jobs:cleanup-retention:processing");
  });

  it("should claim and ack Redis jobs through the processing set", async (): Promise<void> => {
    const payload = '{"project_id":"proj_123","event_id":"evt_123","object_key":"raw-events/proj_123/e.json.gz"}';
    const envelope = JSON.stringify({ claim_id: "claim_123", payload });
    redisEvalMock = vi.fn().mockResolvedValue([payload, envelope]);

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });
    const claimed = await queue.claim("normalize-events");

    expect(claimed?.payload).toEqual({
      project_id: "proj_123",
      event_id: "evt_123",
      object_key: "raw-events/proj_123/e.json.gz"
    });

    await claimed?.ack();

    expect(redisZrangebyscoreMock).toHaveBeenCalledWith("jobs:normalize-events:processing", "-inf", expect.any(String));
    expect(redisEvalMock).toHaveBeenCalledWith(
      expect.stringContaining("LPOP"),
      2,
      "jobs:normalize-events",
      "jobs:normalize-events:processing",
      expect.any(String),
      expect.any(String)
    );
    expect(redisZremMock).toHaveBeenCalledWith("jobs:normalize-events:processing", envelope);
  });

  it("should reclaim stale processing jobs", async (): Promise<void> => {
    const payload = '{"project_id":"proj_123","event_id":"evt_123","object_key":"raw-events/proj_123/e.json.gz"}';
    const envelope = JSON.stringify({ claim_id: "claim_123", payload });
    redisZrangebyscoreMock = vi.fn().mockResolvedValue([envelope]);

    const queue = createRedisQueueClient({ redisUrl: "redis://redis:6379" });
    const reclaimed = await queue.reclaimStaleProcessingJobs("normalize-events", 123456);

    expect(reclaimed).toBe(1);
    expect(redisZrangebyscoreMock).toHaveBeenCalledWith("jobs:normalize-events:processing", "-inf", "123456");
    expect(redisZremMock).toHaveBeenCalledWith("jobs:normalize-events:processing", envelope);
    expect(redisRpushMock).toHaveBeenCalledWith("jobs:normalize-events", payload);
  });

  it("should track rolling incident frequencies and compute spike ratio scaffolding", async (): Promise<void> => {
    const multiExecMock = vi
      .fn()
      .mockResolvedValueOnce([
        [null, 1],
        [null, 0],
        [null, 1],
        [null, 4],
        [null, 36],
        [null, 60],
        [null, 240]
      ]);

    const multiMock = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: multiExecMock
    });

    redisMultiMock = multiMock;

    const counter = createRedisIncidentFrequencyCounter({ redisUrl: "redis://redis:6379" });

    const result = await counter.recordOccurrence({
      incident_id: "inc_123",
      event_id: "evt_123",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    expect(result.occurrences_5m).toBe(36);
    expect(result.baseline_1h_per_5m).toBe(5);
    expect(result.spike_ratio_5m_to_1h).toBe(7.2);
    expect(result.has_sufficient_baseline).toBe(true);
    expect(result.is_spiking).toBe(true);
    expect(multiMock).toHaveBeenCalledOnce();

    await counter.close();
    expect(redisQuitMock).toHaveBeenCalledOnce();
  });

  it("should avoid spike detection for brand-new incidents with insufficient 1h baseline", async (): Promise<void> => {
    const multiExecMock = vi
      .fn()
      .mockResolvedValueOnce([
        [null, 1],
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 3],
        [null, 3],
        [null, 3]
      ]);

    const multiMock = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: multiExecMock
    });

    redisMultiMock = multiMock;

    const counter = createRedisIncidentFrequencyCounter({ redisUrl: "redis://redis:6379" });

    const result = await counter.recordOccurrence({
      incident_id: "inc_new",
      event_id: "evt_new",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    expect(result.occurrences_1h).toBe(3);
    expect(result.spike_ratio_5m_to_1h).toBe(3);
    expect(result.has_sufficient_baseline).toBe(false);
    expect(result.is_spiking).toBe(false);

    await counter.close();
  });

  it("should not mark a single-event window as spiking", async (): Promise<void> => {
    const multiExecMock = vi
      .fn()
      .mockResolvedValueOnce([
        [null, 1],
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1]
      ]);

    const multiMock = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: multiExecMock
    });

    redisMultiMock = multiMock;

    const counter = createRedisIncidentFrequencyCounter({ redisUrl: "redis://redis:6379" });

    const result = await counter.recordOccurrence({
      incident_id: "inc_single",
      event_id: "evt_single",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    expect(result.occurrences_5m).toBe(1);
    expect(result.occurrences_1h).toBe(1);
    expect(result.has_sufficient_baseline).toBe(false);
    expect(result.is_spiking).toBe(false);

    await counter.close();
  });

  it("should keep counts stable under concurrent duplicate event updates", async (): Promise<void> => {
    const zset = new Set<string>();
    const redisChain = {
      zadd: vi.fn((_key: string, _nx: string, _score: number, member: string) => {
        const isNew = zset.has(member) ? 0 : 1;
        zset.add(member);
        redisChain.__added = isNew;
        return redisChain;
      }),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      __added: 0,
      exec: vi.fn(() =>
        Promise.resolve([
          [null, redisChain.__added],
          [null, 0],
          [null, 1],
          [null, 1],
          [null, 1],
          [null, 1],
          [null, 1]
        ])
      )
    };

    const multiMock = vi.fn().mockReturnValue(redisChain);
    redisMultiMock = multiMock;

    const counter = createRedisIncidentFrequencyCounter({ redisUrl: "redis://redis:6379" });

    const [first, second] = await Promise.all([
      counter.recordOccurrence({
        incident_id: "inc_dupe",
        event_id: "evt_same",
        occurred_at: "2026-03-10T12:00:00.000Z"
      }),
      counter.recordOccurrence({
        incident_id: "inc_dupe",
        event_id: "evt_same",
        occurred_at: "2026-03-10T12:00:00.000Z"
      })
    ]);

    expect(first.occurrences_24h).toBe(1);
    expect(second.occurrences_24h).toBe(1);
    expect(redisChain.zadd).toHaveBeenCalledWith(
      "incident-frequency:inc_dupe",
      "NX",
      1773144000,
      "evt_same"
    );

    await counter.close();
  });

  it("should persist frequency snapshots periodically for durability", async (): Promise<void> => {
    const multiExecMock = vi.fn().mockResolvedValue([
      [null, 1],
      [null, 0],
      [null, 1],
      [null, 2],
      [null, 12],
      [null, 60],
      [null, 120]
    ]);

    const multiMock = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: multiExecMock
    });

    redisMultiMock = multiMock;

    const snapshotQuery = vi.fn().mockResolvedValue({ rows: [] });

    const counter = createRedisIncidentFrequencyCounter({
      redisUrl: "redis://redis:6379",
      snapshotStore: { query: snapshotQuery },
      frequencySnapshotIntervalSeconds: 60
    });

    await counter.recordOccurrence({
      incident_id: "inc_123",
      event_id: "evt_1",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    await counter.recordOccurrence({
      incident_id: "inc_123",
      event_id: "evt_2",
      occurred_at: "2026-03-10T12:00:30.000Z"
    });

    await counter.recordOccurrence({
      incident_id: "inc_123",
      event_id: "evt_3",
      occurred_at: "2026-03-10T12:01:01.000Z"
    });

    expect(snapshotQuery).toHaveBeenCalledTimes(2);
    const firstSnapshotSql = snapshotQuery.mock.calls[0]?.[0] as string | undefined;
    expect(firstSnapshotSql).toContain("frequency_snapshot_at IS NULL OR frequency_snapshot_at <= $10::timestamptz");

    await counter.close();
  });

  it("should treat missing Redis pipeline response as zeroed counts", async (): Promise<void> => {
    const multiExecMock = vi.fn().mockResolvedValue(null);
    const multiMock = vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: multiExecMock
    });

    redisMultiMock = multiMock;

    const counter = createRedisIncidentFrequencyCounter({ redisUrl: "redis://redis:6379" });
    const result = await counter.recordOccurrence({
      incident_id: "inc_empty_pipeline",
      event_id: "evt_empty_pipeline",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    expect(result).toEqual({
      occurrences_1m: 0,
      occurrences_5m: 0,
      occurrences_1h: 0,
      occurrences_24h: 0,
      baseline_1h_per_5m: 0,
      spike_ratio_5m_to_1h: 0,
      has_sufficient_baseline: false,
      is_spiking: false
    });

    await counter.close();
  });

  it("should store request anomaly observations under the request-anomaly keyspace", async (): Promise<void> => {
    const redisChain = {
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zcount: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 1],
        [null, 0],
        [null, 1],
        [null, 2],
        [null, 24],
        [null, 60],
        [null, 240]
      ])
    };

    redisMultiMock = vi.fn().mockReturnValue(redisChain);

    const counter = createRedisRequestAnomalyCounter({ redisUrl: "redis://redis:6379" });

    await counter.recordObservation({
      anomaly_key: "proj_1:balanced:api:production:GET:/checkout/:id:404",
      event_id: "evt_anom_1",
      occurred_at: "2026-03-10T12:00:00.000Z"
    });

    expect(redisChain.zadd).toHaveBeenCalledWith(
      "request-anomaly-frequency:proj_1:balanced:api:production:GET:/checkout/:id:404",
      "NX",
      1773144000,
      "evt_anom_1"
    );

    await counter.close();
  });
});
