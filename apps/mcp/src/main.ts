import { createDefaultMcpTools } from "./default-tools.js";
import { createMcpServer, runMcpStdioServer } from "./server.js";

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const localAuth = argv.includes("--local-auth");
  await runMcpStdioServer({
    input: process.stdin,
    output: process.stdout,
    server: createMcpServer({
      tools: await createDefaultMcpTools({ localAuth }),
      localAuth
    })
  });
}
