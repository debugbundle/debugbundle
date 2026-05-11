import type { BundleV1 } from "../../shared-types/src/index.js";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function sortRecordEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

const REPLAY_HEADER_PRIORITY = [
  "authorization",
  "cookie",
  "accept",
  "content-type",
  "origin",
  "accept-language",
  "access-control-request-method",
  "access-control-request-headers",
  "x-request-id",
  "x-correlation-id",
  "x-debugbundle-trace-id"
];

const DROPPED_REPLAY_HEADERS = new Set([
  "host",
  "x-forwarded-host",
  "x-forwarded-proto",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-connection",
  "accept-encoding",
  "content-length",
  "cache-control",
  "pragma",
  "priority",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "user-agent"
]);

function serializeScalarValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return stableStringify(value);
}

function isAmbiguousScalarLikeString(value: string): boolean {
  return /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)$/.test(value);
}

function sanitizeHeaderText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/ +/g, " ").trim();
}

function sanitizeReplayTextBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function normalizeReplayJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeReplayTextBody(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeReplayJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, normalizeReplayJsonValue(entryValue)])
    );
  }

  return value;
}

function normalizeHeaderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeHeaderText(serializeScalarValue(item)));
  }

  const serializedValue = serializeScalarValue(value);
  return sanitizeHeaderText(serializedValue);
}

function normalizeReplayQueryValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeHeaderText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeReplayQueryValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      sortRecordEntries(value as Record<string, unknown>).map(([key, entryValue]) => [key, normalizeReplayQueryValue(entryValue)])
    );
  }

  return value;
}

function hasStructuredQueryAmbiguity(value: unknown): boolean {
  if (typeof value === "string") {
    return isAmbiguousScalarLikeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasStructuredQueryAmbiguity(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => hasStructuredQueryAmbiguity(item));
  }

  return false;
}

function buildStructuredReplayQuery(query: Record<string, unknown>): Record<string, unknown> | undefined {
  const normalizedQuery = Object.fromEntries(
    sortRecordEntries(query).map(([key, value]) => [key, normalizeReplayQueryValue(value)])
  );

  return hasStructuredQueryAmbiguity(normalizedQuery) ? normalizedQuery : undefined;
}

function buildReplayHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const entries = sortRecordEntries(headers)
    .filter(([headerName]) => !DROPPED_REPLAY_HEADERS.has(headerName.toLowerCase()))
    .map(([headerName, headerValue]) => [headerName, normalizeHeaderValue(headerValue)] as [string, unknown]);

  entries.sort(([left], [right]) => {
    const leftPriority = REPLAY_HEADER_PRIORITY.indexOf(left.toLowerCase());
    const rightPriority = REPLAY_HEADER_PRIORITY.indexOf(right.toLowerCase());
    if (leftPriority !== -1 || rightPriority !== -1) {
      if (leftPriority === -1) {
        return 1;
      }
      if (rightPriority === -1) {
        return -1;
      }
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
  });

  return Object.fromEntries(entries);
}

function expandHeaderValues(headers: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(headers).flatMap(([headerName, headerValue]) => {
    if (Array.isArray(headerValue)) {
      return headerValue.map((item): [string, string] => [headerName, serializeScalarValue(item)]);
    }

    return [[headerName, serializeScalarValue(headerValue)]];
  });
}

function getHeaderValues(headers: Record<string, unknown>, headerName: string): string[] {
  const matchedEntry = sortRecordEntries(headers).find(([candidateName]) => candidateName.toLowerCase() === headerName.toLowerCase());
  if (matchedEntry === undefined) {
    return [];
  }

  const [, headerValue] = matchedEntry;
  if (Array.isArray(headerValue)) {
    return headerValue.map((item) => serializeScalarValue(item));
  }

  return [serializeScalarValue(headerValue)];
}

function getPrimaryContentType(headers: Record<string, unknown>): string | null {
  const values = getHeaderValues(headers, "content-type");
  const firstValue = values[0];
  if (firstValue === undefined) {
    return null;
  }

  return firstValue.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function serializeFormValuePairs(prefix: string, value: unknown): Array<[string, string]> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => serializeFormValuePairs(prefix, item));
  }

  return [[prefix, serializeScalarValue(value)]];
}

function buildFormEncodedBody(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return serializeScalarValue(body);
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of sortRecordEntries(body as Record<string, unknown>)) {
    for (const [pairKey, pairValue] of serializeFormValuePairs(key, value)) {
      searchParams.append(pairKey, pairValue);
    }
  }

  return searchParams.toString();
}

function buildReplayBody(body: unknown, headers: Record<string, unknown>): string | null {
  const contentType = getPrimaryContentType(headers);
  if (body === undefined) {
    return null;
  }

  if (body === null) {
    return contentType === "application/json" ? "null" : null;
  }

  if (typeof body === "string") {
    if (contentType === "application/json") {
      return stableStringify(normalizeReplayJsonValue(body));
    }

    return sanitizeReplayTextBody(body);
  }

  if (contentType === "application/x-www-form-urlencoded") {
    return buildFormEncodedBody(body);
  }

  return stableStringify(normalizeReplayJsonValue(body));
}

function buildDeterministicRequestUrl(request: NonNullable<BundleV1["context"]["request"]>): string {
  const protoHeader = request.headers["x-forwarded-proto"];
  const hostHeader = request.headers["host"];
  const forwardedHostHeader = request.headers["x-forwarded-host"];
  const protocol = typeof protoHeader === "string" && protoHeader.length > 0 ? protoHeader : "https";
  const host =
    typeof forwardedHostHeader === "string" && forwardedHostHeader.length > 0
      ? forwardedHostHeader
      : typeof hostHeader === "string" && hostHeader.length > 0
        ? hostHeader
        : "example.invalid";
  const url = new URL(request.path, `${protocol}://${host}`);

  for (const [key, rawValue] of sortRecordEntries(request.query)) {
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        url.searchParams.append(key, sanitizeHeaderText(serializeScalarValue(item)));
      }
      continue;
    }

    url.searchParams.append(key, sanitizeHeaderText(serializeScalarValue(rawValue)));
  }

  return url.toString();
}

export function buildReproduction(bundle: BundleV1): BundleV1["reproduction"] {
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    return {
      possible: false,
      confidence: 0.1,
      reason: "request_context_missing",
      artifacts: null,
      feasibility_reference: null
    };
  }

  const method = request.method.toUpperCase();
  const url = buildDeterministicRequestUrl(request);
  const replayHeaders = buildReplayHeaders(request.headers);
  const contentType = getPrimaryContentType(replayHeaders);
  const structuredReplayQuery = buildStructuredReplayQuery(request.query);
  const headerParts = expandHeaderValues(replayHeaders).map(([headerName, headerValue]) => `${headerName}:${headerValue}`);
  const curlHeaderParts = headerParts.map((header) => `-H ${shellQuote(header.replace(":", ": "))}`);
  const requestBody = buildReplayBody(request.body, replayHeaders);
  const jsonSpecBody =
    contentType === "application/json"
      ? request.body === undefined
        ? null
        : normalizeReplayJsonValue(request.body)
      : typeof request.body === "string"
        ? requestBody
        : request.body === null || request.body === undefined
          ? null
          : request.body;
  const curlBodyPart = requestBody === null ? [] : [`--data-raw ${shellQuote(requestBody)}`];
  const curl = [`curl -X ${method} ${shellQuote(url)}`, ...curlHeaderParts, ...curlBodyPart].join(" ");
  const httpieBase = [`http ${method} ${shellQuote(url)}`, ...headerParts.map((header) => shellQuote(header))].join(" ");
  const httpie = requestBody === null ? httpieBase : `printf '%s' ${shellQuote(requestBody)} | ${httpieBase}`;

  return {
    possible: true,
    confidence: 0.8,
    reason: "request_context_available",
    artifacts: {
      curl,
      httpie,
      json_spec: {
        method,
        url,
        headers: replayHeaders,
        ...(structuredReplayQuery === undefined ? {} : { query: structuredReplayQuery }),
        body: jsonSpecBody
      }
    },
    feasibility_reference: null
  };
}