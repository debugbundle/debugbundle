import { createAgentReadClient, type AgentReadName } from "../../../packages/agent-read-client/src/index.js";
import { agentAuthFilePath, persistAgentAuthState, readAgentAuthState } from "./agent-auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

export async function agentReadCommand(input: {
  action: "connect" | AgentReadName;
  projectId?: string; incidentId?: string; baseUrl?: string; authFilePath?: string;
  limit?: number; cursor?: string;
}, dependencies: { envToken?: string; fetchImpl?: typeof fetch } = {}): Promise<CliCommandResult> {
  try {
    const filePath = input.authFilePath ?? agentAuthFilePath();
    if (input.action === "connect") {
      const token = dependencies.envToken ?? process.env["DEBUGBUNDLE_AGENT_TOKEN"];
      if (token === undefined || !token.startsWith("dbundle_agent_")) {
        return { exitCode: 2, output: "Set DEBUGBUNDLE_AGENT_TOKEN to a scoped agent credential." };
      }
      const baseUrl = input.baseUrl ?? "https://api.debugbundle.com";
      createAgentReadClient({ baseUrl, token, ...(dependencies.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }) });
      await persistAgentAuthState({ bearer_token: token, base_url: baseUrl }, filePath);
      return { exitCode: 0, output: "Agent credential saved in the restricted profile." };
    }
    if (input.projectId === undefined) return { exitCode: 4, output: "A project ID is required." };
    const saved = await readAgentAuthState(filePath).catch(() => null);
    const token = dependencies.envToken ?? process.env["DEBUGBUNDLE_AGENT_TOKEN"] ?? saved?.bearer_token;
    if (token === undefined) return { exitCode: 2, output: "Agent credential missing. Run `debugbundle agent connect` or set DEBUGBUNDLE_AGENT_TOKEN." };
    const baseUrl = input.baseUrl ?? saved?.base_url ?? "https://api.debugbundle.com";
    const client = createAgentReadClient({ baseUrl, token,
      ...(dependencies.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }) });
    const value = await client.read({ name: input.action, projectId: input.projectId,
      ...(input.incidentId === undefined ? {} : { incidentId: input.incidentId }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }) });
    return { exitCode: 0, output: JSON.stringify(value) };
  } catch {
    return { exitCode: 2, output: "Restricted agent request failed. Check the credential, project access, and endpoint." };
  }
}
