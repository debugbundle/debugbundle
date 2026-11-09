import { z } from "zod";
import {
  createReportRunApi,
  createReportPdfApi,
  createReportDeliveryApi,
  ReportApiError,
  type ReportHttpClient,
  type ReportBinaryHttpClient
} from "../../../packages/report-client/src/index.js";
import { ReportRunCommandSchema } from "../../../packages/smart-reports/src/report-run.js";
import { renderReportHtml } from "../../../packages/smart-reports/src/report-html.js";
import { ReportRunListQuerySchema } from "../../../packages/smart-reports/src/report-run-api-contract.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readIntegerOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";
import { saveReportPdf } from "./report-pdf-download.js";
type Base = { organizationId: string; authFilePath?: string; json?: boolean };
export type ReportRunCommandInput = Base &
  (
    | { action: "list"; limit?: number; cursor?: string }
    | {
        action:
          | "get"
          | "content"
          | "html"
          | "cancel"
          | "delete"
          | "pdf-status"
          | "pdf-prepare"
          | "deliveries";
        runId: string;
      }
    | { action: "pdf-download"; runId: string; outputPath: string }
    | { action: "generate"; command: z.input<typeof ReportRunCommandSchema> }
  );
export async function reportRunsWithAuthCommand(
  input: ReportRunCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => ReportHttpClient & Partial<ReportBinaryHttpClient>;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const client = (dependencies.createHttpClient ?? createCliHttpClient)({
      baseUrl: auth.base_url
    });
    const api = createReportRunApi(client),
      pdf = createReportPdfApi(client);
    const scope = { bearerToken: auth.bearer_token, organizationId: input.organizationId };
    let result: unknown;
    switch (input.action) {
      case "deliveries":
        result = {
          deliveries: await createReportDeliveryApi(client).list({ ...scope, runId: input.runId })
        };
        break;
      case "pdf-status":
        result = { pdf: await pdf.status({ ...scope, runId: input.runId }) };
        break;
      case "pdf-prepare":
        result = { pdf: await pdf.request({ ...scope, runId: input.runId }) };
        break;
      case "pdf-download":
        result = await saveReportPdf(input.outputPath, () =>
          pdf.download({ ...scope, runId: input.runId })
        );
        break;
      case "list":
        result = await api.list({
          ...scope,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor })
        });
        break;
      case "get":
        result = { run: await api.get({ ...scope, runId: input.runId }) };
        break;
      case "content":
        result = await api.content({ ...scope, runId: input.runId });
        break;
      case "html": {
        const view = await api.content({ ...scope, runId: input.runId });
        const html = renderReportHtml(view.document, {
          available_source_refs: view.available_source_refs,
          source_base_url: auth.base_url
        });
        if (!input.json) return { exitCode: 0, output: html };
        result = { html };
        break;
      }
      case "generate":
        result = { run: await api.generate({ ...scope, command: input.command }) };
        break;
      case "cancel":
        result = { run: await api.cancel({ ...scope, runId: input.runId }) };
        break;
      case "delete":
        await api.remove({ ...scope, runId: input.runId });
        result = { deleted: true };
        break;
    }
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    return {
      exitCode: error instanceof ReportApiError && error.status === 403 ? 4 : 1,
      output:
        error instanceof ReportApiError
          ? error.code
          : error instanceof CliInputError
            ? error.message
            : "report_command_failed"
    };
  }
}
export async function handleReportRunCommand(
  parsed: ParsedArgv,
  command: typeof reportRunsWithAuthCommand = reportRunsWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 1, "action");
  if (
    ![
      "list",
      "get",
      "content",
      "html",
      "generate",
      "cancel",
      "delete",
      "pdf-status",
      "pdf-prepare",
      "pdf-download",
      "deliveries"
    ].includes(action)
  )
    throw new CliInputError("Unknown report-runs action.");
  const resource = action !== "list" && action !== "generate";
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "generate"
      ? ["command-json"]
      : action === "list"
        ? ["limit", "cursor"]
        : action === "pdf-download"
          ? ["output"]
          : [])
  ]);
  ensureNoExtraPositionals(parsed, resource ? 4 : 3);
  const base: Base = { organizationId: requirePositional(parsed, 2, "organization-id") };
  if (!z.uuid().safeParse(base.organizationId).success)
    throw new CliInputError("Provide an organisation UUID.");
  const auth = readStringOption(parsed, "auth-file"),
    json = readBooleanOption(parsed, "json");
  if (auth !== undefined) base.authFilePath = auth;
  if (json !== undefined) base.json = json;
  if (action === "list") {
    const limit = readIntegerOption(parsed, "limit"),
      cursor = readStringOption(parsed, "cursor");
    const query = ReportRunListQuerySchema.safeParse({
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor })
    });
    if (!query.success)
      throw new CliInputError(
        "Provide a limit from 1 to 100 and a cursor from a previous report page."
      );
    return command({
      ...base,
      action,
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor })
    });
  }
  if (action === "generate") {
    try {
      const raw = readStringOption(parsed, "command-json");
      if (raw === undefined || raw.length > 4096) throw new Error("invalid");
      return await command({
        ...base,
        action,
        command: ReportRunCommandSchema.parse(JSON.parse(raw))
      });
    } catch (error) {
      if (error instanceof CliInputError) throw error;
      throw new CliInputError(
        "Provide --command-json with a stable request_id UUID, definition_id, expected_version and completed UTC period. Reuse the same command for a retry."
      );
    }
  }
  const runId = requirePositional(parsed, 3, "run-id");
  if (!z.uuid().safeParse(runId).success) throw new CliInputError("Provide a report run UUID.");
  if (action === "pdf-download") {
    const outputPath = readStringOption(parsed, "output");
    if (!outputPath?.trim()) throw new CliInputError("Provide --output with a new PDF file path.");
    return command({ ...base, action, runId, outputPath });
  }
  return command({
    ...base,
    action: action as
      | "get"
      | "content"
      | "html"
      | "cancel"
      | "delete"
      | "pdf-status"
      | "pdf-prepare"
      | "deliveries",
    // Read-only delivery metadata never retries or sends an email.
    runId
  });
}
