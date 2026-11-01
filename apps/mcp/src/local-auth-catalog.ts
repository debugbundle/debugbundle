import { z } from "zod";

import { MCP_TOOL_CATALOG } from "./tool-catalog.js";

// Local-auth is an explicit transport profile. Never mutate the legacy catalog:
// installed clients and OpenClaw retain their existing credential schemas.
function localSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (!(schema instanceof z.ZodObject)) throw new Error("unsupported_local_auth_schema");
  // Preserve object refinements while projecting credentials. Zod 4's omit()
  // deliberately refuses refined objects; clone() retains their checks.
  const object = schema as z.ZodObject<Record<string, z.ZodType>>;
  const shape = { ...object.shape };
  delete shape["bearerToken"];
  return object.clone({ ...object.def, shape }).strict();
}

export const LOCAL_AUTH_MCP_TOOL_CATALOG = MCP_TOOL_CATALOG.map((tool) => ({
  ...tool,
  inputSchema: localSchema(tool.inputSchema)
}));

export const LOCAL_AUTH_REQUIRED_TOOLS = new Set(
  MCP_TOOL_CATALOG.filter((tool) => {
    const schema = tool.inputSchema;
    const token = (schema as z.ZodObject<Record<string, z.ZodType>>).shape["bearerToken"];
    return token !== undefined && !token.isOptional();
  }).map((tool) => tool.name as string)
);
