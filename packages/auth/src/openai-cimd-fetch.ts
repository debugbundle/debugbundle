import { lookup as lookupHost } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import { OPENAI_CIMD_RESPONSE_LIMIT_BYTES } from "./openai-oauth-constants.js";
import { isAllowedOpenAiCimdFetchUrl } from "./openai-oauth-metadata.js";

const OPENAI_CIMD_FETCH_TIMEOUT_MS = 5_000;
const OPENAI_CIMD_CACHE_TTL_MS = 300_000;
const OPENAI_CIMD_CACHE_ENTRY_LIMIT_BYTES = 192 * 1024;

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export interface OpenAiCimdResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface OpenAiCimdFetchOptions {
  cache?: OpenAiCimdResponseCache;
  lookup?: (hostname: string) => Promise<OpenAiCimdResolvedAddress[]>;
  timeoutMs?: number;
  responseLimitBytes?: number;
}

export interface OpenAiCimdResponseCache {
  getOpenAiCimdResponse(url: string): Promise<string | undefined>;
  setOpenAiCimdResponse(url: string, response: string, ttlMs: number): Promise<void>;
}

interface SerializedOpenAiCimdResponse {
  body: string;
  headers: string[][];
  status: number;
  statusText: string;
}

function deserializeCachedResponse(value: string, limitBytes: number): Response {
  if (Buffer.byteLength(value, "utf8") > OPENAI_CIMD_CACHE_ENTRY_LIMIT_BYTES) {
    throw new Error("oauth_cimd_cache_entry_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("oauth_cimd_cache_entry_invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("oauth_cimd_cache_entry_invalid");
  }
  const record = parsed as Partial<SerializedOpenAiCimdResponse>;
  if (
    record.status !== 200 ||
    typeof record.statusText !== "string" ||
    typeof record.body !== "string" ||
    !Array.isArray(record.headers) ||
    record.headers.length > 50 ||
    record.headers.some(
      (header) =>
        !Array.isArray(header) ||
        header.length !== 2 ||
        header.some((entry) => typeof entry !== "string" || entry.length > 8_192)
    )
  ) {
    throw new Error("oauth_cimd_cache_entry_invalid");
  }
  const body = Buffer.from(record.body, "base64");
  if (body.byteLength > limitBytes || body.toString("base64") !== record.body) {
    throw new Error("oauth_cimd_cache_entry_invalid");
  }
  return new Response(body, {
    status: record.status,
    statusText: record.statusText,
    headers: record.headers as [string, string][]
  });
}

async function serializeResponse(response: Response): Promise<string> {
  const body = Buffer.from(await response.clone().arrayBuffer());
  return JSON.stringify({
    body: body.toString("base64"),
    headers: [...response.headers.entries()],
    status: response.status,
    statusText: response.statusText
  } satisfies SerializedOpenAiCimdResponse);
}

function assertPublicAddresses(addresses: readonly OpenAiCimdResolvedAddress[]): void {
  if (addresses.length === 0) {
    throw new Error("oauth_cimd_dns_lookup_empty");
  }
  for (const entry of addresses) {
    const family = isIP(entry.address);
    if (
      family !== entry.family ||
      (family === 6 && entry.address.toLowerCase().startsWith("::ffff:")) ||
      blockedAddresses.check(entry.address, family === 4 ? "ipv4" : "ipv6")
    ) {
      throw new Error("oauth_cimd_address_not_allowed");
    }
  }
}

async function defaultLookup(hostname: string): Promise<OpenAiCimdResolvedAddress[]> {
  const addresses = await lookupHost(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4
  }));
}

function createPinnedLookup(addresses: readonly OpenAiCimdResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const family = options.family === 4 || options.family === 6 ? options.family : undefined;
    const candidates =
      family === undefined ? [...addresses] : addresses.filter((entry) => entry.family === family);
    if (candidates.length === 0) {
      callback(
        Object.assign(new Error("oauth_cimd_address_family_unavailable"), { code: "ENOTFOUND" }),
        ""
      );
      return;
    }
    if (options.all === true) {
      callback(null, candidates);
      return;
    }
    const selected = candidates[0]!;
    callback(null, selected.address, selected.family);
  };
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void =>
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("oauth_cimd_fetch_aborted")
      );
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("oauth_cimd_fetch_failed"));
      }
    );
  });
}

async function readBoundedResponse(
  response: Response,
  limitBytes: number,
  signal: AbortSignal
): Promise<Response> {
  if (response.body === null) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const result = await raceWithAbort(reader.read(), signal);
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > limitBytes) {
        await reader.cancel("oauth_cimd_response_too_large");
        throw new Error("oauth_cimd_response_too_large");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

export function createOpenAiCimdFetch(
  fetchImpl?: typeof fetch,
  options: OpenAiCimdFetchOptions = {}
): typeof fetch {
  const resolveHost = options.lookup ?? defaultLookup;
  const cache = options.cache;
  const timeoutMs = options.timeoutMs ?? OPENAI_CIMD_FETCH_TIMEOUT_MS;
  const responseLimitBytes = options.responseLimitBytes ?? OPENAI_CIMD_RESPONSE_LIMIT_BYTES;

  return async (input, init) => {
    const requestedUrl =
      typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (!isAllowedOpenAiCimdFetchUrl(requestedUrl)) {
      throw new Error("oauth_cimd_fetch_url_not_allowed");
    }

    const url = new URL(requestedUrl);
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = (): void => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("oauth_cimd_fetch_timeout")),
      timeoutMs
    );
    timeout.unref();

    let dispatcher: Agent | undefined;
    try {
      if (cache !== undefined) {
        const cached = await raceWithAbort(
          cache.getOpenAiCimdResponse(requestedUrl),
          controller.signal
        );
        if (cached !== undefined) {
          return deserializeCachedResponse(cached, responseLimitBytes);
        }
      }
      const addresses = await raceWithAbort(resolveHost(url.hostname), controller.signal);
      assertPublicAddresses(addresses);

      let response: Response;
      if (fetchImpl === undefined) {
        dispatcher = new Agent({ connect: { lookup: createPinnedLookup(addresses) } });
        response = (await undiciFetch(url, {
          ...init,
          redirect: "manual",
          signal: controller.signal,
          dispatcher
        } as unknown as NonNullable<Parameters<typeof undiciFetch>[1]>)) as unknown as Response;
      } else {
        response = await fetchImpl(input, {
          ...init,
          redirect: "manual",
          signal: controller.signal
        });
      }

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel("oauth_cimd_redirect_not_allowed");
        throw new Error("oauth_cimd_redirect_not_allowed");
      }
      const boundedResponse = await readBoundedResponse(
        response,
        responseLimitBytes,
        controller.signal
      );
      if (cache !== undefined && boundedResponse.status === 200) {
        await raceWithAbort(
          cache.setOpenAiCimdResponse(
            requestedUrl,
            await serializeResponse(boundedResponse),
            OPENAI_CIMD_CACHE_TTL_MS
          ),
          controller.signal
        );
      }
      return boundedResponse;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
      if (dispatcher !== undefined) {
        await dispatcher.close();
      }
    }
  };
}
