import { agentOperations } from "./openapi-agent.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SESSION_COOKIE_NAME, type JsonSchemaDocument, type SchemaSpec } from "./openapi-model.js";
import { foundationOperations } from "./openapi-foundation.js";
import { evidenceOperations } from "./openapi-evidence.js";
import { projectsOperations } from "./openapi-projects.js";
import { configurationOperations } from "./openapi-configuration.js";
import { notificationsOperations } from "./openapi-notifications.js";
import { captureOperations } from "./openapi-capture.js";

function toJsonSchema(schema: unknown): JsonSchemaDocument {
  // Minimized evidence uses the same JSON schemas as the hosted MCP projection.
  if (
    schema !== null &&
    typeof schema === "object" &&
    !("_def" in schema) &&
    ("type" in schema || "$ref" in schema || "anyOf" in schema)
  )
    return schema as JsonSchemaDocument;
  const document = zodToJsonSchema(schema as never, {
    target: "jsonSchema2019-09",
    $refStrategy: "none",
    definitionPath: "$defs"
  }) as JsonSchemaDocument;

  delete document["$schema"];
  return document;
}

function buildParameters(
  schema: unknown,
  location: "path" | "query"
): Array<Record<string, unknown>> {
  const jsonSchema = toJsonSchema(schema) as {
    properties?: Record<string, JsonSchemaDocument>;
    required?: string[];
  };
  const required = new Set(jsonSchema.required ?? []);

  return Object.entries(jsonSchema.properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: propertySchema
  }));
}

function resolveSchemaSpec(
  schema: SchemaSpec,
  components: Map<string, JsonSchemaDocument>
): JsonSchemaDocument {
  if ("oneOf" in schema) {
    return {
      oneOf: schema.oneOf.map((entry) => resolveSchemaSpec(entry, components))
    };
  }

  if (!components.has(schema.name)) {
    components.set(schema.name, toJsonSchema(schema.schema));
  }

  return { $ref: `#/components/schemas/${schema.name}` };
}

export function buildPublicOpenApiSpec(): Record<string, unknown> {
  const components = new Map<string, JsonSchemaDocument>();
  const operations = [
    ...agentOperations(),
    ...foundationOperations(),
    ...evidenceOperations(),
    ...projectsOperations(),
    ...configurationOperations(),
    ...notificationsOperations(),
    ...captureOperations()
  ];
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of operations) {
    const pathItem = (paths[operation.path] ??= {});
    const parameters = [
      ...(operation.params === undefined ? [] : buildParameters(operation.params, "path")),
      ...(operation.query === undefined ? [] : buildParameters(operation.query, "query"))
    ];

    pathItem[operation.method] = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: operation.tags,
      ...(operation.security === undefined ? {} : { security: operation.security }),
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(operation.requestBody === undefined
        ? {}
        : {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: resolveSchemaSpec(operation.requestBody, components)
                }
              }
            }
          }),
      responses: Object.fromEntries(
        Object.entries(operation.responses).map(([statusCode, response]) => [
          statusCode,
          {
            description: response.description,
            ...(response.headers === undefined
              ? {}
              : {
                  headers: Object.fromEntries(
                    Object.entries(response.headers).map(([headerName, header]) => [
                      headerName,
                      {
                        description: header.description,
                        schema: toJsonSchema(header.schema)
                      }
                    ])
                  )
                }),
            ...(response.schema === undefined
              ? {}
              : {
                  content: {
                    "application/json": {
                      schema: resolveSchemaSpec(response.schema, components)
                    }
                  }
                })
          }
        ])
      )
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "DebugBundle HTTP API",
      version: "v1",
      description: "Source-backed OpenAPI description for the public DebugBundle HTTP API."
    },
    servers: [{ url: "https://api.debugbundle.com", description: "DebugBundle Cloud API" }],
    tags: Array.from(new Set(operations.flatMap((operation) => operation.tags))).map((name) => ({
      name
    })),
    paths,
    components: {
      securitySchemes: {
        browserSession: {
          type: "apiKey",
          in: "cookie",
          name: SESSION_COOKIE_NAME,
          description: "Browser session cookie for interactive authenticated routes."
        },
        memberBearerToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Opaque member token",
          description: "Bearer member token used by the CLI, MCP, and automation."
        },
        agentBearerToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "dbundle_agent_ credential",
          description:
            "Project-bound incident:read-minimized credential accepted only by the five agent evidence reads."
        },
        projectBearerToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Opaque project token",
          description: "Bearer project token used by ingestion and SDK config routes."
        }
      },
      schemas: Object.fromEntries(components.entries())
    }
  };
}
