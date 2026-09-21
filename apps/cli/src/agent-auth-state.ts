import { mkdir, open, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const AgentAuthSchema = z
  .object({
    bearer_token: z.string().startsWith("dbundle_agent_").max(512),
    base_url: z.string().url().max(2048)
  })
  .strict();
export type AgentAuthState = z.infer<typeof AgentAuthSchema>;

export function agentAuthFilePath(): string {
  return join(homedir(), ".debugbundle", "agent-auth.json");
}

export async function readAgentAuthState(filePath = agentAuthFilePath()): Promise<AgentAuthState> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const file = await handle.stat();
      if (!file.isFile() || (file.mode & 0o077) !== 0 || file.size > 8192)
        throw new Error("agent_auth_unavailable");
      // Bound the read itself as well as stat: the file may grow after it is opened.
      const buffer = Buffer.alloc(8193);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 8192) throw new Error("agent_auth_unavailable");
      return AgentAuthSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error("agent_auth_unavailable");
  }
}

export async function persistAgentAuthState(
  state: AgentAuthState,
  filePath = agentAuthFilePath()
): Promise<void> {
  const parsed = AgentAuthSchema.parse(state);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  const file = await open(tmp, "wx", 0o600);
  try {
    try {
      await file.writeFile(`${JSON.stringify(parsed)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(tmp, filePath);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}
