import { ApiRequestError } from "./api-client.js";

const DEFAULT_RATE_LIMIT_RETRY_MS = 1_000;
const DEFAULT_MAX_RETRIES_PER_ITEM = 3;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function resolveRetryDelayMs(error: ApiRequestError): number {
  if (error.retryAfterMs === null || !Number.isFinite(error.retryAfterMs)) {
    return DEFAULT_RATE_LIMIT_RETRY_MS;
  }

  return Math.max(0, Math.trunc(error.retryAfterMs));
}

export async function runRateLimitedBulkAction<TItem, TResult>(input: {
  items: TItem[];
  execute: (item: TItem) => Promise<TResult>;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetriesPerItem?: number;
}): Promise<Array<PromiseSettledResult<TResult>>> {
  const results: Array<PromiseSettledResult<TResult>> = [];
  const sleepFn = input.sleep ?? sleep;
  const maxRetriesPerItem = input.maxRetriesPerItem ?? DEFAULT_MAX_RETRIES_PER_ITEM;

  for (const item of input.items) {
    let retries = 0;

    while (true) {
      try {
        const value = await input.execute(item);
        results.push({
          status: "fulfilled",
          value
        });
        break;
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.status === 429 &&
          error.code === "rate_limited" &&
          retries < maxRetriesPerItem
        ) {
          retries += 1;
          await sleepFn(resolveRetryDelayMs(error));
          continue;
        }

        results.push({
          status: "rejected",
          reason: error
        });
        break;
      }
    }
  }

  return results;
}
