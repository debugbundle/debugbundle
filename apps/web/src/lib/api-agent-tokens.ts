import { z } from "zod";
import { AgentTokenSchema } from "../../../../packages/token-management/src/index.js";
import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
export type AgentCredential = Omit<z.infer<typeof AgentTokenSchema>, "plaintext">;
function managementRecord(token: z.infer<typeof AgentTokenSchema>): AgentCredential {
  const record = { ...token };
  delete record.plaintext;
  return record;
}
export async function listAgentCredentials(projectId: string): Promise<AgentCredential[]> {
  const result = z.object({ tokens: z.array(AgentTokenSchema) }).parse(
    await readJson(
      await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/agent-tokens`, {
        credentials: "include"
      })
    )
  );
  return result.tokens.map(managementRecord);
}
export async function createAgentCredential(
  projectId: string,
  payload: { label: string; expires_at?: string }
): Promise<z.infer<typeof AgentTokenSchema>> {
  const result = z.object({ token: AgentTokenSchema }).parse(
    await readJson(
      await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/agent-tokens`, {
        method: "POST",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify(payload)
      })
    )
  );
  return result.token;
}
export async function revokeAgentCredential(
  projectId: string,
  tokenId: string
): Promise<AgentCredential> {
  const result = z
    .object({ token: AgentTokenSchema })
    .parse(
      await readJson(
        await fetch(
          `${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/agent-tokens/${encodeURIComponent(tokenId)}/revoke`,
          { method: "POST", credentials: "include", headers: buildBrowserSessionHeaders(true) }
        )
      )
    );
  return managementRecord(result.token);
}
