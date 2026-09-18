import { z } from "zod";

import { MCP_TOOL_CATALOG } from "./tool-catalog.js";

// Local-auth is an explicit transport profile. Never mutate the legacy catalog:
// installed clients and OpenClaw retain their existing credential schemas.
function localSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) {
    const effect = schema as z.ZodEffects<z.ZodTypeAny>;
    return new z.ZodEffects({ ...effect._def, schema: localSchema(effect.innerType()) });
  }
  if (!(schema instanceof z.ZodObject)) throw new Error("unsupported_local_auth_schema");
  return (schema as z.ZodObject<z.ZodRawShape>).omit({ bearerToken: true }).strict();
}

export const LOCAL_AUTH_MCP_TOOL_CATALOG = MCP_TOOL_CATALOG.map((tool) => ({
  ...tool,
  inputSchema: localSchema(tool.inputSchema)
}));

export const LOCAL_AUTH_REQUIRED_TOOLS = new Set(
  MCP_TOOL_CATALOG.filter((tool) => {
    let schema: z.ZodTypeAny = tool.inputSchema;
    while (schema instanceof z.ZodEffects)
      schema = (schema as z.ZodEffects<z.ZodTypeAny>).innerType();
    const token = (schema as z.ZodObject<z.ZodRawShape>).shape["bearerToken"];
    return token !== undefined && !token.isOptional();
  }).map((tool) => tool.name as string)
);
