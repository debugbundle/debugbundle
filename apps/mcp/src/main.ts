import { createDefaultMcpTools } from "./default-tools.js";
import { createMcpServer, runMcpStdioServer } from "./server.js";

export async function main(): Promise<void> {
  await runMcpStdioServer({
    input: process.stdin,
    output: process.stdout,
    server: createMcpServer({
      tools: await createDefaultMcpTools()
    })
  });
}

if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
