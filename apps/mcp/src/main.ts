import { createDefaultMcpTools } from "./default-tools.js";
import { createMcpServer, runMcpStdioServer } from "./server.js";

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const localAuth = argv.includes("--local-auth");
  const agentRead = argv.includes("--agent-read");
  if (agentRead && localAuth) throw new Error("agent_read_conflicts_with_local_auth");
  const mode = agentRead ? { localAuth, agentRead: true } : { localAuth };
  await runMcpStdioServer({
    input: process.stdin,
    output: process.stdout,
    server: createMcpServer({
      tools: await createDefaultMcpTools(mode),
      ...mode
    })
  });
}
