import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import plugin, {
  DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES
} from "../../../apps/openclaw-plugin/src/index.js";

describe("OpenClaw mutation approval registration", () => {
  it("registers a deny-on-timeout per-call approval for every optional tool without exposing inputs", async () => {
    const require = createRequire(join(process.cwd(), "apps/openclaw-plugin/package.json"));
    const { getToolPluginMetadata } = (await import(
      pathToFileURL(require.resolve("openclaw/plugin-sdk/tool-plugin")).href
    )) as { getToolPluginMetadata: (entry: unknown) => { tools: unknown[] } | undefined };
    const on = vi.fn();
    const registerTool = vi.fn();
    plugin.register({ on, registerTool, pluginConfig: {} } as never);
    expect(getToolPluginMetadata(plugin)?.tools).toHaveLength(138);
    expect(on).toHaveBeenCalledWith("before_tool_call", expect.any(Function));
    const hook = on.mock.calls[0]?.[1] as (event: unknown) => unknown;
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).toEqual(expect.arrayContaining([
      "debugbundle_get_notification_preferences", "debugbundle_update_notification_preferences",
      "debugbundle_pause_notifications", "debugbundle_resume_notifications"
    ]));
    for (const toolName of DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES) {
      const decision = hook({
        toolName,
        params: { bearerToken: "sensitive-test-input", label: "untrusted-text" }
      });
      expect(decision).toMatchObject({
        requireApproval: {
          allowedDecisions: ["allow-once", "deny"],
          timeoutBehavior: "deny",
          timeoutMs: 120_000
        }
      });
      expect(JSON.stringify(decision)).not.toContain("sensitive-test-input");
      expect(JSON.stringify(decision)).not.toContain("untrusted-text");
    }
    expect(hook({ toolName: "debugbundle_list_incidents", params: {} })).toBeUndefined();
    expect(hook({ toolName: "other_plugin_delete", params: {} })).toBeUndefined();
    expect(registerTool).toHaveBeenCalledTimes(138);
  });

  it("fails before registering tools when the host cannot install the safety hook", () => {
    const registerTool = vi.fn();
    expect(() => plugin.register({ registerTool, pluginConfig: {} } as never)).toThrow();
    expect(registerTool).not.toHaveBeenCalled();
  });
});
