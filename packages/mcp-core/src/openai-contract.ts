import { isDeepStrictEqual } from "node:util";

import { redact, type JsonValue } from "../../redaction/src/index.js";

import schemaContract from "./contracts/schemas.json" with { type: "json" };
import toolContracts from "./contracts/tool-contracts.json" with { type: "json" };

export const OPENAI_TOOL_NAMES = [
  "list_projects",
  "list_services",
  "list_incidents",
  "get_incident",
  "get_incident_context",
  "get_bundle",
  "get_reproduction",
  "list_improvements",
  "get_improvement",
  "get_improvement_bundle",
  "get_usage_summary",
  "get_route_metrics",
  "get_journey_patterns",
  "get_device_breakdown",
  "get_referrer_metrics",
  "get_action_metrics",
  "list_funnel_metrics",
  "get_funnel_analysis",
  "get_incident_impact",
  "list_health_checks",
  "get_health_check",
  "list_health_check_results",
  "list_health_check_daily_rollups"
] as const;

export type OpenAiToolName = (typeof OPENAI_TOOL_NAMES)[number];
export type OpenAiToolCatalogEntry = (typeof toolContracts.tools)[number];

type JsonSchema = {
  $ref?: string;
  anyOf?: JsonSchema[];
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
};

const schemaDefinitions = schemaContract.$defs as Record<string, JsonSchema>;
const toolNames = new Set<string>(OPENAI_TOOL_NAMES);
const MAX_OUTPUT_BYTES = 524_288;

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export const OPENAI_SCHEMA_CONTRACT = deepFreeze(schemaContract);
export const OPENAI_TOOL_CATALOG = deepFreeze(toolContracts.tools);

function requireTool(name: string): OpenAiToolCatalogEntry {
  if (!toolNames.has(name)) {
    throw new Error(`openai_mcp_unknown_tool:${name}`);
  }

  const tool = OPENAI_TOOL_CATALOG.find((entry) => entry.name === name);
  if (tool === undefined) {
    throw new Error(`openai_mcp_contract_missing_tool:${name}`);
  }
  return tool;
}

function readSchemaReference(reference: string): JsonSchema {
  const prefix = "schemas.json#/$defs/";
  if (!reference.startsWith(prefix)) {
    throw new Error(`openai_mcp_invalid_schema_ref:${reference}`);
  }
  const schema = schemaDefinitions[reference.slice(prefix.length)];
  if (schema === undefined) {
    throw new Error(`openai_mcp_missing_schema_ref:${reference}`);
  }
  return schema;
}

export function getOpenAiToolSchemas(name: string): {
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema: Readonly<Record<string, unknown>>;
} {
  const tool = requireTool(name);
  return {
    inputSchema: readSchemaReference(tool.input_schema_ref) as Readonly<Record<string, unknown>>,
    outputSchema: readSchemaReference(tool.output_schema_ref) as Readonly<Record<string, unknown>>
  };
}

function resolveSchema(schema: JsonSchema): JsonSchema {
  if (schema.$ref === undefined) {
    return schema;
  }
  const definitionPrefix = "#/$defs/";
  if (!schema.$ref.startsWith(definitionPrefix)) {
    throw new Error(`openai_mcp_invalid_definition_ref:${schema.$ref}`);
  }
  const resolved = schemaDefinitions[schema.$ref.slice(definitionPrefix.length)];
  if (resolved === undefined) {
    throw new Error(`openai_mcp_missing_definition_ref:${schema.$ref}`);
  }
  return resolveSchema(resolved);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function projectSchemaValue(schemaInput: JsonSchema, value: unknown, path: string): unknown {
  const schema = resolveSchema(schemaInput);

  if (schema.anyOf !== undefined) {
    for (const candidate of schema.anyOf) {
      try {
        return projectSchemaValue(candidate, value, path);
      } catch {
        // Try the next explicitly allowed representation.
      }
    }
    throw new Error(`openai_mcp_schema_mismatch:${path}`);
  }

  if (schema.enum !== undefined && !schema.enum.some((allowed) => Object.is(allowed, value))) {
    throw new Error(`openai_mcp_schema_mismatch:${path}`);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(type, value))) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
    const bounded = schema.maxLength === undefined ? value : value.slice(0, schema.maxLength);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(bounded))) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
    if (schema.format === "uri") {
      try {
        new URL(bounded);
      } catch {
        throw new Error(`openai_mcp_schema_mismatch:${path}`);
      }
    }
    return bounded;
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new Error(`openai_mcp_schema_mismatch:${path}`);
    }
    const bounded = schema.maxItems === undefined ? value : value.slice(0, schema.maxItems);
    return schema.items === undefined
      ? bounded
      : bounded.map((entry, index) =>
          projectSchemaValue(schema.items!, entry, `${path}[${index}]`)
        );
  }

  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const projected: Record<string, unknown> = {};

    for (const [key, propertySchema] of Object.entries(properties)) {
      const propertyValue = value[key];
      if (propertyValue === undefined) {
        if (required.has(key)) {
          throw new Error(`openai_mcp_schema_mismatch:${path}.${key}`);
        }
        continue;
      }
      projected[key] = projectSchemaValue(propertySchema, propertyValue, `${path}.${key}`);
    }

    if (schema.additionalProperties !== false) {
      for (const [key, nested] of Object.entries(value)) {
        if (!(key in properties)) {
          projected[key] = nested;
        }
      }
    }
    return projected;
  }

  return value;
}

function validateSchemaValue(schemaInput: JsonSchema, value: unknown, path: string): unknown {
  const projected = projectSchemaValue(schemaInput, value, path);
  if (!isDeepStrictEqual(projected, value)) {
    throw new Error(`openai_mcp_schema_mismatch:${path}`);
  }
  return projected;
}

function normalizeHealthUrls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeHealthUrls);
  }
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    normalized[key] = normalizeHealthUrls(nested);
  }

  const displaySource =
    typeof normalized["display_url"] === "string" ? normalized["display_url"] : normalized["url"];
  if (
    typeof displaySource === "string" &&
    ("check_id" in normalized || "checked_host" in normalized)
  ) {
    normalized["display_url"] = sanitizeHealthCheckUrl(displaySource);
  }
  const finalSource =
    typeof normalized["final_display_url"] === "string"
      ? normalized["final_display_url"]
      : normalized["final_url"];
  if (
    typeof finalSource === "string" &&
    ("result_id" in normalized || "checked_host" in normalized)
  ) {
    normalized["final_display_url"] = sanitizeHealthCheckUrl(finalSource);
    if (typeof normalized["checked_host"] !== "string") {
      normalized["checked_host"] = new URL(normalized["final_display_url"] as string).hostname;
    }
  }
  return normalized;
}

export function sanitizeHealthCheckUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("openai_mcp_invalid_health_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("openai_mcp_invalid_health_url");
  }

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname
    .split("/")
    .map((segment) =>
      /(?:^|[_-])(?:sk|pk|token|secret|apikey|api_key|key|bearer)(?:[_-]|$)|^[a-f0-9]{24,}$/i.test(
        segment
      )
        ? "[redacted]"
        : segment
    )
    .join("/");
  return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
}

export function parseOpenAiToolInput(name: string, value: unknown): Record<string, unknown> {
  const tool = requireTool(name);
  try {
    const parsed = projectSchemaValue(readSchemaReference(tool.input_schema_ref), value, "input");
    if (!isRecord(parsed) || !isDeepStrictEqual(parsed, value)) {
      throw new Error("strict_input_required");
    }
    return parsed;
  } catch {
    throw new Error(`openai_mcp_invalid_input:${name}`);
  }
}

export function projectOpenAiToolOutput(name: string, value: unknown): unknown {
  const tool = requireTool(name);
  const redacted = redact(value as JsonValue).redacted;
  const normalized = normalizeHealthUrls(redacted);
  const projected = projectSchemaValue(
    readSchemaReference(tool.output_schema_ref),
    normalized,
    "output"
  );
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") > MAX_OUTPUT_BYTES) {
    throw new Error(`openai_mcp_output_too_large:${name}`);
  }
  return projected;
}

export function validateOpenAiToolOutput(name: string, value: unknown): unknown {
  const tool = requireTool(name);
  return validateSchemaValue(readSchemaReference(tool.output_schema_ref), value, "output");
}
