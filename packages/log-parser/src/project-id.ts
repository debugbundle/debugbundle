import { createHash } from "node:crypto";

import { createEventEnvelope, type EventEnvelope } from "../../shared-types/src/index.js";

import type { LogParseProfile, LogParserInput, ParsedLogEvent, ServiceDescriptor } from "./types.js";

const INGEST_SDK = {
  name: "debugbundle-ingest",
  version: "0.1.0"
} as const;

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "application";
}

export function buildDeterministicUuid(parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function chooseService(profile: LogParseProfile, preferredServiceName?: string): ServiceDescriptor {
  const matchingService = preferredServiceName === undefined
    ? undefined
    : profile.services.find((service) => service.name === preferredServiceName);
  if (matchingService !== undefined) {
    return {
      name: matchingService.name,
      runtime: matchingService.runtime,
      framework: matchingService.framework
    };
  }

  const firstBackendService = profile.services.find((service) => service.kind === "backend" || service.kind === "worker");
  if (firstBackendService !== undefined) {
    return {
      name: firstBackendService.name,
      runtime: firstBackendService.runtime,
      framework: firstBackendService.framework
    };
  }

  return {
    name: slugify(profile.project.name),
    runtime: null,
    framework: null
  };
}

export function buildProjectId(profile: LogParseProfile): string {
  return buildDeterministicUuid(["debugbundle-local-project-v1", profile.project.repo_url || profile.project.name]);
}

export function buildBackendExceptionEvent(
  parsedEvent: ParsedLogEvent,
  eventIndex: number,
  input: LogParserInput
): EventEnvelope {
  const service = chooseService(input.profile, parsedEvent.serviceName);
  const projectId = buildProjectId(input.profile);
  return createEventEnvelope({
    event_id: buildDeterministicUuid([
      "debugbundle-log-ingest-event-v1",
      input.format,
      input.filePath,
      String(eventIndex),
      parsedEvent.occurredAt,
      parsedEvent.exceptionName,
      parsedEvent.message,
      parsedEvent.stack
    ]),
    occurred_at: parsedEvent.occurredAt,
    project_id: projectId,
    sdk_name: INGEST_SDK.name,
    sdk_version: INGEST_SDK.version,
    event_type: "backend_exception",
    service: {
      name: service.name,
      environment: parsedEvent.environment,
      runtime: service.runtime,
      framework: service.framework
    },
    payload: {
      name: parsedEvent.exceptionName,
      message: parsedEvent.message,
      stack: parsedEvent.stack,
      handled: false,
      request: {
        method: "GET",
        path: parsedEvent.requestPath,
        query: {},
        headers: {}
      },
      response: {
        status_code: parsedEvent.statusCode
      },
      runtime: {
        version: "unknown"
      }
    }
  });
}