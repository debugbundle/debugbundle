import { describe, expect, it } from "vitest";
import {
  renderWeeklyReportEmail,
  type WeeklyReportProjectInput
} from "../../../packages/email/src/index.js";

const window = {
  windowStart: "2026-11-08T23:00:00.000Z",
  windowEnd: "2026-11-15T23:00:00.000Z"
};

function project(overrides: Partial<WeeklyReportProjectInput> = {}): WeeklyReportProjectInput {
  return {
    projectId: "project-api",
    projectName: "API",
    bundleCounts: { failure: 1, improvement: 0 },
    newIncidents: 0,
    resolvedIncidents: 0,
    openedIncidentsResolved: 0,
    regressions: 0,
    topSpikingIncidents: [],
    ...overrides
  };
}

describe("weekly report wording", () => {
  it.each([
    [0, 0, 0, "No new incidents opened this week."],
    [0, 1, 0, "You resolved 1 existing incident this week."],
    [0, 2, 0, "You resolved 2 existing incidents this week."],
    [1, 130, 1, "You resolved the only incident opened this week."],
    [2, 2, 2, "You resolved all 2 incidents opened this week."],
    [1, 0, 0, "The only incident opened this week is still open."],
    [2, 1, 1, "You closed 1 of the 2 incidents opened this week."],
    [2, 0, 0, "You closed 0 of the 2 incidents opened this week."]
  ] as const)(
    "describes %i opened, %i resolved and %i opened-then-resolved incidents",
    (newIncidents, resolvedIncidents, openedIncidentsResolved, expected) => {
      const rendered = renderWeeklyReportEmail({
        ...window,
        projects: [project({ newIncidents, resolvedIncidents, openedIncidentsResolved })]
      });

      expect(rendered.text.split("\n")[0]).toBe(expected);
      expect(rendered.html).toContain(expected);
      expect(rendered.text).not.toMatch(/\ball 1\b|\b1 incidents\b/);
      expect(rendered.html).not.toMatch(/\ball 1\b|\b1 incidents\b/);
    }
  );

  it.each([
    [0, 0, 0, "2 projects had reportable activity and no new incidents opened this week."],
    [0, 1, 0, "Across 2 projects, you resolved 1 existing incident this week."],
    [0, 2, 0, "Across 2 projects, you resolved 2 existing incidents this week."],
    [1, 130, 1, "Across 2 projects, you resolved the only incident opened this week."],
    [2, 2, 2, "Across 2 projects, you resolved all 2 incidents opened this week."],
    [1, 0, 0, "Across 2 projects, the only incident opened this week is still open."],
    [2, 1, 1, "Across 2 projects, you closed 1 of the 2 incidents opened this week."]
  ] as const)(
    "combines projects with %i opened, %i resolved and %i opened-then-resolved incidents",
    (newIncidents, resolvedIncidents, openedIncidentsResolved, expected) => {
      const rendered = renderWeeklyReportEmail({
        ...window,
        projects: [
          project({ newIncidents, resolvedIncidents, openedIncidentsResolved }),
          project({ projectId: "project-worker", projectName: "Worker" })
        ]
      });

      expect(rendered.subject).toBe("DebugBundle weekly project digest for 2 projects");
      expect(rendered.text.split("\n")[0]).toBe(expected);
      expect(rendered.html).toContain(expected);
      expect(rendered.text).not.toMatch(/\ball 1\b|\b1 incidents\b/);
      expect(rendered.html).not.toMatch(/\ball 1\b|\b1 incidents\b/);
    }
  );

  it.each([0, 1, 2])("uses matching count labels and spike wording for %i items", (count) => {
    const rendered = renderWeeklyReportEmail({
      ...window,
      projects: [
        project({
          bundleCounts: { failure: count, improvement: count },
          newIncidents: count,
          resolvedIncidents: count,
          openedIncidentsResolved: count,
          regressions: count,
          topSpikingIncidents: Array.from({ length: count }, (_, index) => ({
            incident_id: `incident-${index}`,
            title: `Timeout <${index}>`,
            occurrence_count: count,
            spike_detected_at: window.windowEnd
          }))
        })
      ]
    });
    const labels =
      count === 1
        ? [
            "Failure bundle",
            "Improvement bundle",
            "New incident",
            "Resolved incident",
            "Regression"
          ]
        : [
            "Failure bundles",
            "Improvement bundles",
            "New incidents",
            "Resolved incidents",
            "Regressions"
          ];

    expect(rendered.subject).toBe("DebugBundle weekly project digest for API");
    expect(rendered.html).toContain(">Project</td>");
    expect(rendered.html).not.toContain(">Projects</td>");
    for (const label of labels) {
      expect(rendered.text).toContain(`${label}: ${count}\n`);
      expect(rendered.html).toContain(`>${label}</td>`);
    }
    expect(rendered.text).toContain(
      count === 1 ? "Opened incident resolved: 1" : `Opened incidents resolved: ${count}`
    );
    const spikeHeading = count === 1 ? "Top spiking incident" : "Top spiking incidents";
    expect(rendered.text).toContain(`${spikeHeading}:\n`);
    expect(rendered.html).toContain(`>${spikeHeading}</h2>`);
    if (count === 0) {
      expect(rendered.text).toContain("Top spiking incidents:\nNone");
    } else {
      const occurrences = count === 1 ? "1 occurrence, spike at" : "2 occurrences, spike at";
      expect(rendered.text).toContain(occurrences);
      expect(rendered.html).toContain(occurrences);
      expect(rendered.html).toContain("Timeout &lt;0&gt;");
      expect(rendered.html).not.toContain("Timeout <0>");
    }
    expect(rendered.html).toContain(
      count === 1
        ? "1 new incident, 1 resolved incident, 1 failure bundle, 1 improvement bundle, 1 regression"
        : `${count} new incidents, ${count} resolved incidents, ${count} failure bundles, ${count} improvement bundles`
    );
  });

  it.each([
    [0, "0 occurrences"],
    [1, "1 occurrence"],
    [2, "2 occurrences"]
  ] as const)("formats %i occurrences independently of the number of spikes", (count, expected) => {
    const rendered = renderWeeklyReportEmail({
      ...window,
      projects: [
        project({
          topSpikingIncidents: [
            {
              incident_id: "incident-timeout",
              title: "Timeout",
              occurrence_count: count,
              spike_detected_at: window.windowEnd
            }
          ]
        })
      ]
    });

    expect(rendered.text).toContain("Top spiking incident:\n");
    expect(rendered.html).toContain(">Top spiking incident</h2>");
    expect(rendered.text).toContain(`(${expected}, spike at`);
    expect(rendered.html).toContain(`(${expected}, spike at`);
  });

  it("retains legacy input support with singular wording", () => {
    const { projectId, bundleCounts, newIncidents, regressions, topSpikingIncidents } = project({
      newIncidents: 1
    });
    const rendered = renderWeeklyReportEmail({
      ...window,
      projectId,
      bundleCounts,
      newIncidents,
      regressions,
      topSpikingIncidents
    });

    expect(rendered.text).toContain("The only incident opened this week is still open.");
    expect(rendered.text).toContain("New incident: 1");
    expect(rendered.html).toContain("The only incident opened this week is still open.");
  });

  it("keeps empty project totals plural", () => {
    const rendered = renderWeeklyReportEmail({ ...window, projects: [] });

    expect(rendered.subject).toBe("DebugBundle weekly project digest for 0 projects");
    expect(rendered.text).toContain("No project activity was reported this week.");
    expect(rendered.html).toContain(">Projects</td>");
  });
});
