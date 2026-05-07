import type { EventEnvelope } from "../../../shared-types/src/index.js";

import { buildBackendExceptionEvent } from "../project-id.js";
import type { LogParserInput, ParsedLogEvent } from "../types.js";

function parseApacheTimestamp(rawTimestamp: string): string {
  const parsedMatch = /^(?<month>[A-Z][a-z]{2}) (?<day>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2})(?:\.\d+)? (?<year>\d{4})$/u.exec(rawTimestamp);
  if (parsedMatch?.groups === undefined) {
    throw new Error(`Invalid Apache log timestamp: ${rawTimestamp}`);
  }

  const month = parsedMatch.groups["month"];
  const day = parsedMatch.groups["day"];
  const year = parsedMatch.groups["year"];
  const time = parsedMatch.groups["time"];
  if (month === undefined || day === undefined || year === undefined || time === undefined) {
    throw new Error(`Invalid Apache log timestamp: ${rawTimestamp}`);
  }

  const parsedTimestamp = new Date(`${month} ${day} ${year} ${time} UTC`);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new Error(`Invalid Apache log timestamp: ${rawTimestamp}`);
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

function parseApacheErrorLog(content: string): ParsedLogEvent[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parsedLine = /^\[(?<weekday>[A-Z][a-z]{2})\s+(?<timestamp>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\d{4})\]\s+\[[^\]]+\]\s+\[[^\]]+\](?:\s+\[[^\]]+\])?\s+PHP\s+(?<level>Fatal error|Parse error|Warning|Notice|Deprecated):\s+(?<message>.+)$/u.exec(line);
      if (parsedLine?.groups === undefined) {
        throw new Error(`Unsupported apache-error log line: ${line}`);
      }

      const timestamp = parsedLine.groups["timestamp"];
      const message = parsedLine.groups["message"];
      if (timestamp === undefined || message === undefined) {
        throw new Error(`Unsupported apache-error log line: ${line}`);
      }

      const extracted = extractExceptionParts(message);
      return {
        occurredAt: parseApacheTimestamp(timestamp),
        environment: "production",
        exceptionName: extracted.exceptionName,
        message: extracted.message,
        stack: message,
        requestPath: extracted.requestPath,
        statusCode: 500
      };
    });
}

export function parseApacheError(content: string, input: LogParserInput): EventEnvelope[] {
  return parseApacheErrorLog(content).map((event, index) => buildBackendExceptionEvent(event, index, input));
}