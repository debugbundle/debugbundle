import type { EventEnvelope } from "../../shared-types/src/index.js";

export const CANONICAL_LOG_FORMAT = "debugbundle-ndjson" as const;

export const ACCEPTED_LOG_FORMATS = [CANONICAL_LOG_FORMAT, "php-error", "apache-error"] as const;

export type CanonicalLogFormat = typeof CANONICAL_LOG_FORMAT;

export type AcceptedLogFormat = (typeof ACCEPTED_LOG_FORMATS)[number];

export type LogParseProfile = {
  project: {
    name: string;
    repo_url: string;
  };
  services: Array<{
    name: string;
    kind: "frontend" | "backend" | "worker";
    runtime: string;
    framework: string;
  }>;
};

export type ServiceDescriptor = {
  name: string;
  runtime: string | null;
  framework: string | null;
};

export type ParsedLogEvent = {
  occurredAt: string;
  serviceName?: string;
  environment: string;
  exceptionName: string;
  message: string;
  stack: string;
  requestPath: string;
  statusCode: number;
};

export type LogParserInput = {
  filePath: string;
  format: AcceptedLogFormat;
  profile: LogParseProfile;
};

export type LogParser = (content: string, input: LogParserInput) => EventEnvelope[];

export type RegisteredLogParser = {
  format: AcceptedLogFormat;
  parse: LogParser;
};