import {
  mkdtemp,
  readFile,
  chmod,
  rm,
  stat,
  writeFile,
  symlink,
  mkdir,
  readdir
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentReadCommand } from "../../../apps/cli/src/agent-read-command.js";
import {
  persistAgentAuthState,
  readAgentAuthState,
  agentAuthFilePath
} from "../../../apps/cli/src/agent-auth-state.js";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("restricted agent CLI profile", () => {
  it("saves only a distinct agent credential with owner-only file permissions and never echoes it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debugbundle-agent-test-"));
    directories.push(directory);
    const authFilePath = join(directory, "agent-auth.json");
    const token = "dbundle_agent_synthetic_do_not_log";
    const result = await agentReadCommand({ action: "connect", authFilePath }, { envToken: token });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain(token);
    expect((await stat(authFilePath)).mode & 0o077).toBe(0);
    expect(await readFile(authFilePath, "utf8")).toContain(token);
    expect(await readAgentAuthState(authFilePath)).toEqual({
      bearer_token: token,
      base_url: "https://api.debugbundle.com"
    });
    expect(agentAuthFilePath()).toMatch(/\.debugbundle\/agent-auth\.json$/);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        project: { project_id: "project", name: "Safe", raw: "SYNTHETIC_SECRET" }
      })
    );
    const read = await agentReadCommand(
      { action: "project_summary", projectId: "project", authFilePath },
      { fetchImpl }
    );
    expect(read).toEqual({
      exitCode: 0,
      output: JSON.stringify({ project: { project_id: "project", name: "Safe" } })
    });
    await chmod(authFilePath, 0o644);
    await expect(readAgentAuthState(authFilePath)).rejects.toThrow("agent_auth_unavailable");
  });

  it("rejects symlinked or oversized credentials and cleans failed atomic writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debugbundle-agent-test-"));
    directories.push(directory);
    const state = { bearer_token: "dbundle_agent_synthetic", base_url: "https://example.test" };
    const file = join(directory, "auth.json");
    await persistAgentAuthState(state, file);
    await symlink(file, join(directory, "link.json"));
    await expect(readAgentAuthState(join(directory, "link.json"))).rejects.toThrow(
      "agent_auth_unavailable"
    );
    await writeFile(
      file,
      JSON.stringify({ ...state, bearer_token: "dbundle_agent_" + "x".repeat(20_000) })
    );
    await expect(readAgentAuthState(file)).rejects.toThrow("agent_auth_unavailable");
    await writeFile(file, '{"bearer_token":"dbundle_mem_wrong"}');
    await expect(readAgentAuthState(file)).rejects.toThrow("agent_auth_unavailable");
    const target = join(directory, "directory.json");
    await mkdir(target);
    await expect(persistAgentAuthState(state, target)).rejects.toThrow();
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses member credentials and never falls back to the normal login profile", async () => {
    const fetchImpl = vi.fn();
    const result = await agentReadCommand(
      {
        action: "project_summary",
        projectId: "project_1",
        authFilePath: "/nonexistent/agent-auth.json"
      },
      { envToken: "dbundle_mem_broad", fetchImpl }
    );
    expect(result.exitCode).toBe(2);
    expect(result.output).not.toContain("dbundle_mem_broad");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
