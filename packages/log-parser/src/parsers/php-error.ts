import type { EventEnvelope } from "../../../shared-types/src/index.js";

import { buildBackendExceptionEvent } from "../project-id.js";
import type { LogParserInput, ParsedLogEvent } from "../types.js";

function parsePhpTimestamp(rawTimestamp: string): string {
  const parsedTimestamp = new Date(rawTimestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new Error(`Invalid PHP log timestamp: ${rawTimestamp}`);
  }

  return parsedTimestamp.toISOString();
}

function extractExceptionParts(rawMessage: string): { exceptionName: string; message: string; requestPath: string } {
  const uncaughtMatch = /Uncaught\s+(?<name>[A-Za-z0-9_\\]+):\s+(?<message>.+?)\s+in\s+(?<file>.+?)(?::\d+| on line \d+)?$/u.exec(rawMessage);
  if (uncaughtMatch?.groups !== undefined) {
    const exceptionName = uncaughtMatch.groups["name"];
    const message = uncaughtMatch.groups["message"];
    const requestPath = uncaughtMatch.groups["file"];
    if (exceptionName === undefined || message === undefined || requestPath === undefined) {
      throw new Error(`Invalid exception payload: ${rawMessage}`);
    }

    return {
      exceptionName,
      message,
      requestPath
    };
  }

  const inFileMatch = /^(?<message>.+?)\s+in\s+(?<file>.+?)(?::\d+| on line \d+)?$/u.exec(rawMessage);
  if (inFileMatch?.groups !== undefined) {
    const message = inFileMatch.groups["message"];
    const requestPath = inFileMatch.groups["file"];
    if (message === undefined || requestPath === undefined) {
      throw new Error(`Invalid exception payload: ${rawMessage}`);
    }

    return {
      exceptionName: "RuntimeError",
      message,
      requestPath
    };
  }

  return {
    exceptionName: "RuntimeError",
    message: rawMessage,
    requestPath: "/unknown"
  };
}

function parsePhpErrorLog(content: string): ParsedLogEvent[] {
  const blocks = content
    .split(/(?=^\[[^\]]+\]\s+PHP\s)/mu)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map((block) => {
    const [headerLine, ...stackLines] = block.split(/\r?\n/u);
    const parsedHeader = /^\[(?<timestamp>[^\]]+)\]\s+PHP\s+(?<level>Fatal error|Parse error|Warning|Notice|Deprecated):\s+(?<message>.+)$/u.exec(headerLine ?? "");
    if (parsedHeader?.groups === undefined) {
      throw new Error(`Unsupported php-error log line: ${headerLine}`);
    }

    const timestamp = parsedHeader.groups["timestamp"];
    const message = parsedHeader.groups["message"];
    if (timestamp === undefined || message === undefined) {
      throw new Error(`Unsupported php-error log line: ${headerLine}`);
    }

    const extracted = extractExceptionParts(message);
    return {
      occurredAt: parsePhpTimestamp(timestamp),
      environment: "production",
      exceptionName: extracted.exceptionName,
      message: extracted.message,
      stack: [message, ...stackLines].join("\n"),
      requestPath: extracted.requestPath,
      statusCode: 500
    };
  });
}

export function parsePhpError(content: string, input: LogParserInput): EventEnvelope[] {
  return parsePhpErrorLog(content).map((event, index) => buildBackendExceptionEvent(event, index, input));
}