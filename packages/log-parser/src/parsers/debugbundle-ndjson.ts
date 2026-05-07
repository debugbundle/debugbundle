import { z } from "zod";

import { EventEnvelopeSchema, type EventEnvelope } from "../../../shared-types/src/index.js";

import { buildBackendExceptionEvent } from "../project-id.js";
import { CANONICAL_LOG_FORMAT, type LogParserInput } from "../types.js";

const DebugbundleNdjsonStructuredEntrySchema = z.object({
  type: z.literal("error"),
  error_type: z.string().min(1),
  message: z.string().min(1),
  stack: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  timestamp: z.string().datetime({ offset: true }),
  environment: z.string().min(1),
  service: z.string().min(1)
});

export function parseDebugbundleNdjson(content: string, input: LogParserInput): EventEnvelope[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const parsedLine = JSON.parse(line) as unknown;
      const directEnvelope = EventEnvelopeSchema.safeParse(parsedLine);
      if (directEnvelope.success) {
        return directEnvelope.data;
      }

      const parsedEntry = DebugbundleNdjsonStructuredEntrySchema.parse(parsedLine);
      return buildBackendExceptionEvent(
        {
          occurredAt: parsedEntry.timestamp,
          serviceName: parsedEntry.service,
          environment: parsedEntry.environment,
          exceptionName: parsedEntry.error_type,
          message: parsedEntry.message,
          stack: parsedEntry.stack,
          requestPath: parsedEntry.file,
          statusCode: 500
        },
        index,
        {
          filePath: input.filePath,
          format: CANONICAL_LOG_FORMAT,
          profile: input.profile
        }
      );
    });
}