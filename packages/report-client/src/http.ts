import { z } from "zod";
export interface ReportHttpClient {
  request(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}
export class ReportApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`report_api_error:${status}:${code}`);
    this.name = "ReportApiError";
  }
}
export type ReportScope = { bearerToken: string; organizationId: string };
export function reportResourceId(raw: string): string {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new ReportApiError(400, "invalid_resource_id");
  return encodeURIComponent(parsed.data);
}
export function reportPayload<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ReportApiError(400, "invalid_payload");
  return parsed.data;
}
export type ReportRequest = <T>(
  input: ReportScope,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  schema: z.ZodType<T>,
  payload?: unknown
) => Promise<T>;
export function createReportRequest(client: ReportHttpClient): ReportRequest {
  return async <T>(
    input: ReportScope,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    schema: z.ZodType<T>,
    payload?: unknown
  ): Promise<T> => {
    const response = await client.request({
      method,
      path,
      bearerToken: input.bearerToken,
      ...(payload === undefined ? {} : { body: payload })
    });
    if (response.status < 200 || response.status >= 300) {
      const error = z.object({ error: z.string().max(200) }).safeParse(response.body);
      throw new ReportApiError(response.status, error.success ? error.data.error : "unknown_error");
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new ReportApiError(502, "invalid_response");
    return parsed.data;
  };
}
