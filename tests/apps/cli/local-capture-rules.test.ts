import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_CAPTURE_RULES_FILE_PATH,
  createEmptyLocalCaptureRulesFile,
  readLocalCaptureRulesFile,
  writeLocalCaptureRulesFile,
} from "../../../apps/cli/src/local-capture-rules.js";

const tempDirectories: string[] = [];

describe("local capture-rules file", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }));
      })
    );
  });

  it("returns an empty file shape when the file is missing", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-capture-rules-"));
    tempDirectories.push(rootDirectory);

    await expect(readLocalCaptureRulesFile(rootDirectory)).resolves.toEqual({
      version: 1,
      rules: [],
    });
  });

  it("reads a valid local capture-rules file", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-capture-rules-"));
    tempDirectories.push(rootDirectory);

    await mkdir(join(rootDirectory, ".debugbundle"), { recursive: true });
    await writeFile(
      join(rootDirectory, LOCAL_CAPTURE_RULES_FILE_PATH),
      JSON.stringify({
        version: 1,
        rules: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "Demote analytics resource noise",
            description: null,
            enabled: true,
            action: "demote",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: "analytics.example.com" },
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z",
          },
        ],
      }),
      "utf8"
    );

    const file = await readLocalCaptureRulesFile(rootDirectory);
    expect(file.rules).toHaveLength(1);
    expect(file.rules[0]?.matcher).toEqual({
      event_types: ["frontend_exception"],
      browser_event_kind: "resource_error",
      resource_url: { host: "analytics.example.com" },
    });
  });

  it("writes the canonical local file shape", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-capture-rules-"));
    tempDirectories.push(rootDirectory);

    const file = createEmptyLocalCaptureRulesFile();
    await writeLocalCaptureRulesFile(rootDirectory, file);

    expect(JSON.parse(await readFile(join(rootDirectory, LOCAL_CAPTURE_RULES_FILE_PATH), "utf8"))).toEqual({
      version: 1,
      rules: [],
    });
  });
});
