import type { EventEnvelope } from "../../shared-types/src/index.js";

import { parseApacheError } from "./parsers/apache-error.js";
import { parseDebugbundleNdjson } from "./parsers/debugbundle-ndjson.js";
import { parsePhpError } from "./parsers/php-error.js";
import { ACCEPTED_LOG_FORMATS, type AcceptedLogFormat, type LogParserInput, type RegisteredLogParser } from "./types.js";

const BUILTIN_LOG_PARSERS: ReadonlyArray<RegisteredLogParser> = [
  {
    format: "debugbundle-ndjson",
    parse: (content, input) => parseDebugbundleNdjson(content, input)
  },
  {
    format: "php-error",
    parse: (content, input) => parsePhpError(content, input)
  },
  {
    format: "apache-error",
    parse: (content, input) => parseApacheError(content, input)
  }
];

export function formatAcceptedLogFormats(): string {
  return ACCEPTED_LOG_FORMATS.join(", ");
}

export function parseAcceptedLogFormat(format: string): AcceptedLogFormat | null {
  return ACCEPTED_LOG_FORMATS.find((candidate) => candidate === format) ?? null;
}

export function parseLogFile(content: string, input: LogParserInput): EventEnvelope[] {
  const parser = BUILTIN_LOG_PARSERS.find((candidate) => candidate.format === input.format);
  if (parser === undefined) {
    throw new Error(`Unsupported log format: ${input.format}`);
  }

  return parser.parse(content, input);
}