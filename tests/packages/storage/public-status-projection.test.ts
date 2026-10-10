import { describe, expect, it } from "vitest";
import { projectPublicStatus } from "../../../packages/storage/src/public-status-projection.js";

const now = new Date("2026-10-08T10:00:00Z");
const rollup = {
  day: "2026-10-08",
  state: "down" as const,
  total_checks: 100,
  successful_checks: 90,
  failed_checks: 10,
  degraded_checks: 10,
  downtime_seconds: 600,
  incident_ids: ["private-incident"],
  last_checked_at: "2026-10-08T09:59:00Z"
};
const check = {
  check_id: "private-check",
  name: "API",
  status: "passing" as const,
  interval_seconds: 60,
  failure_threshold: 3,
  url: "https://private.example/?secret=private-value",
  environment: "private-env",
  last_result_error_message: "private-error",
  rollups: [rollup]
};
const input = [{ project_id: "private-project", name: "My project", checks: [check] }];

describe("public status projection", () => {
  it("sanitizes credential-bearing labels and keeps failing coverage ahead of paused/unknown", () => {
    const secret = "dbundle_mem_" + "a".repeat(48);
    const result = projectPublicStatus(
      `token=${secret}`,
      [
        {
          ...input[0]!,
          name: `Authorization: Bearer ${secret}`,
          checks: [
            { ...check, name: `api_key=${secret}`, status: "failing" },
            { ...check, status: "paused" },
            { ...check, status: "unknown" }
          ]
        }
      ],
      now
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.projects[0]?.current_state).toBe("down");
  });
  it("allows only status fields, retaining outage history after current recovery", () => {
    const result = projectPublicStatus("My status", input, now);
    expect(result.projects[0]?.current_state).toBe("operational");
    expect(result.projects[0]?.uptime_percentage).toBe(90);
    expect(result.projects[0]?.days.at(-1)?.impact).toBe("outage");
    const serialized = JSON.stringify(result);
    for (const privateValue of [
      "private-incident",
      "private-check",
      "private-project",
      "private-env",
      "private-error",
      "private.example",
      "private-value"
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(result.projects[0]?.name).toBe("My project");
    expect(result.projects[0]?.checks[0]?.name).toBe("API");
  });
  it("does not declare complete coverage when a published check is unmeasured or paused", () => {
    for (const status of ["unknown", "paused"] as const) {
      const result = projectPublicStatus(
        "Status",
        [{ ...input[0]!, checks: [check, { ...check, status, rollups: [] }] }],
        now
      );
      expect(result.projects[0]?.current_state).not.toBe("operational");
      expect(result.projects[0]?.checks[1]?.uptime_percentage).toBeNull();
    }
  });
  it("marks stale verified evidence unknown even when monitor attempts remain recent", () => {
    const result = projectPublicStatus(
      "Status",
      [
        {
          ...input[0]!,
          checks: [{ ...check, rollups: [{ ...rollup, last_checked_at: "2026-10-08T09:00:00Z" }] }]
        }
      ],
      now
    );
    expect(result.projects[0]?.current_state).toBe("unknown");
    expect(result.projects[0]?.checks[0]?.last_verified_at).toBe("2026-10-08T09:00:00Z");
  });
  it("weights uptime by verified check counts and excludes missing days", () => {
    const result = projectPublicStatus(
      "Status",
      [
        {
          ...input[0]!,
          checks: [
            check,
            {
              ...check,
              rollups: [
                {
                  ...rollup,
                  total_checks: 900,
                  successful_checks: 900,
                  failed_checks: 0,
                  state: "operational",
                  incident_ids: [],
                  downtime_seconds: 0
                }
              ]
            }
          ]
        }
      ],
      now
    );
    expect(result.projects[0]?.uptime_percentage).toBe(99);
    expect(result.projects[0]?.days).toHaveLength(30);
    expect(result.projects[0]?.days[0]?.state).toBe("unknown");
  });
});
