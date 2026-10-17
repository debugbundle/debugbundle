import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

type Publisher = {
  publishTargets: (
    context: { targetEntries: Array<[string, { type: string }]> },
    options: { dryRun: boolean },
    dependencies: {
      preflight: () => void;
      publishTarget: (key: string) => Promise<unknown>;
      recordResult: (key: string, result: unknown) => void;
    }
  ) => Promise<void>;
};

const helperUrl = pathToFileURL(join(process.cwd(), "scripts/mcp-ecosystem-publication.mjs")).href;

describe("OpenClaw publication preflight", () => {
  it.each(["clawhub", "clawhubPlugin"])(
    "blocks every publisher when %s preflight fails",
    async (key) => {
      const { publishTargets } = (await import(helperUrl)) as Publisher;
      const publishTarget = vi.fn();
      await expect(
        publishTargets(
          {
            targetEntries: [
              ["officialRegistry", { type: "push" }],
              [key, { type: "push" }]
            ]
          },
          { dryRun: false },
          {
            preflight: () => {
              throw new Error("unsafe_candidate");
            },
            publishTarget,
            recordResult: vi.fn()
          }
        )
      ).rejects.toThrow("unsafe_candidate");
      expect(publishTarget).not.toHaveBeenCalled();
    }
  );

  it("runs preflight first and persists each receipt before the next publisher", async () => {
    const { publishTargets } = (await import(helperUrl)) as Publisher;
    const events: string[] = [];
    await publishTargets(
      {
        targetEntries: [
          ["clawhub", { type: "push" }],
          ["clawhubPlugin", { type: "push" }],
          ["glama", { type: "discovery" }]
        ]
      },
      { dryRun: false },
      {
        preflight: () => {
          events.push("check");
        },
        publishTarget: async (key) => {
          events.push(key);
          return "receipt";
        },
        recordResult: (key, result) => {
          events.push(`${key}:${String(result)}`);
        }
      }
    );
    expect(events).toEqual([
      "check",
      "clawhub",
      "clawhub:receipt",
      "clawhubPlugin",
      "clawhubPlugin:receipt"
    ]);
  });

  it("keeps planning read-only and does not gate unrelated targets", async () => {
    const { publishTargets } = (await import(helperUrl)) as Publisher;
    const preflight = vi.fn();
    for (const [key, dryRun] of [
      ["clawhub", true],
      ["officialRegistry", false]
    ] as const) {
      await publishTargets(
        { targetEntries: [[key, { type: "push" }]] },
        { dryRun },
        {
          preflight,
          publishTarget: vi.fn(),
          recordResult: vi.fn()
        }
      );
    }
    expect(preflight).not.toHaveBeenCalled();
  });
});
