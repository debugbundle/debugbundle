import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  rememberSession,
  resetBrowserSessionClientState
} from "../../../apps/web/src/lib/api-client.js";
import {
  bulkReopenIncidents,
  createMemberToken,
  listProjectGitHubRules,
  removeProjectGitHubRepo,
  resolveIncident,
  listMemberTokens,
  listIncidents,
  listProjectAvailabilityCheckDailyRollups,
  listProjects
} from "../../../apps/web/src/lib/api.js";
import { leaveProjectMembership } from "../../../apps/web/src/lib/project-sharing-api.js";
import { createIncident, createSession } from "./web-test-helpers.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dashboard management reads", () => {
  it("reads a newly reported incident on the next reload even inside the project freshness window", async () => {
    const session = createSession();
    const incidents = [createIncident({ incident_id: "first" })];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.cache).toBe("no-store");
      return url.includes("/v1/incidents?")
        ? json({ incidents, next_cursor: null })
        : json({ projects: [] });
    });
    vi.stubGlobal("fetch", fetch);
    rememberSession(session);
    await listProjects();
    await expect(listIncidents()).resolves.toMatchObject({ incidents: [{ incident_id: "first" }] });
    incidents.unshift(createIncident({ incident_id: "new" }));
    resetBrowserSessionClientState();
    rememberSession(session);
    await listProjects();
    await expect(listIncidents()).resolves.toMatchObject({
      incidents: [{ incident_id: "new" }, { incident_id: "first" }]
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("refreshes project counters after single and bulk incident changes and retains rollup history", async () => {
    rememberSession(createSession());
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/resolve")) return json({ incident: createIncident() });
      if (url.endsWith("/reopen")) return json({ incidents: [createIncident()] });
      return json({ projects: [], rollups: [] });
    });
    vi.stubGlobal("fetch", fetch);
    const read = () =>
      Promise.all([
        listProjects(),
        listProjects("retained"),
        listProjectAvailabilityCheckDailyRollups("p", "c")
      ]);
    await read();
    await resolveIncident("inc");
    await read();
    await bulkReopenIncidents(["inc"]);
    await read();
    expect(fetch.mock.calls.filter(([url]) => url.includes("/daily-rollups"))).toHaveLength(1);
    expect(
      fetch.mock.calls.filter(
        ([url]) => url.includes("/v1/projects") && !url.includes("/daily-rollups")
      )
    ).toHaveLength(6);
  });

  it("discards previously authorized settings after leaving a shared project", async () => {
    rememberSession(createSession());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ rules: [{ rule_id: "visible" }] }))
      .mockResolvedValueOnce(json({ member: {} }))
      .mockResolvedValueOnce(json({ error: "project_not_found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await listProjectGitHubRules("shared");
    await leaveProjectMembership("shared");
    await expect(listProjectGitHubRules("shared")).rejects.toMatchObject({ status: 404 });
  });

  it("refreshes dispatch rules removed with their GitHub repository", async () => {
    rememberSession(createSession());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ rules: [{ rule_id: "old" }] }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ rules: [] }));
    vi.stubGlobal("fetch", fetch);
    await listProjectGitHubRules("p");
    await removeProjectGitHubRepo("p");
    await expect(listProjectGitHubRules("p")).resolves.toEqual([]);
  });

  it("shares identical in-flight and fresh reads but keeps exact project views separate", async () => {
    rememberSession(createSession());
    const fetch = vi
      .fn<(path: string) => Promise<Response>>()
      .mockImplementation(async () => json({ projects: [] }));
    vi.stubGlobal("fetch", fetch);

    await Promise.all([listProjects(), listProjects(), listProjects("retained")]);
    await listProjects();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `${API_BASE}/v1/projects`,
      `${API_BASE}/v1/projects?project_id=retained`
    ]);
  });

  it("refreshes stale project data and keeps historical reads warm for longer", async () => {
    rememberSession(createSession());
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const fetch = vi.fn(async () => json({ projects: [], rollups: [] }));
    vi.stubGlobal("fetch", fetch);

    await Promise.all([listProjects(), listProjectAvailabilityCheckDailyRollups("p", "c")]);
    now.mockReturnValue(60_001);
    await Promise.all([listProjects(), listProjectAvailabilityCheckDailyRollups("p", "c")]);

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("invalidates the token list after a successful write", async () => {
    rememberSession(createSession());
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => json({ tokens: [] }))
      .mockImplementationOnce(async () => json({ token: { token_id: "new" } }))
      .mockImplementationOnce(async () => json({ tokens: [{ token_id: "new" }] }));
    vi.stubGlobal("fetch", fetch);

    await expect(listMemberTokens(true)).resolves.toEqual([]);
    await createMemberToken({ label: "Owner automation" });
    await expect(listMemberTokens(true)).resolves.toEqual([{ token_id: "new" }]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("shares a new post-save read with callers still waiting for the previous list", async () => {
    rememberSession(createSession());
    let finishOld!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          })
      )
      .mockImplementationOnce(async () => json({ token: { token_id: "new" } }))
      .mockImplementationOnce(async () => json({ tokens: [{ token_id: "new" }] }));
    vi.stubGlobal("fetch", fetch);

    const previous = listMemberTokens(true);
    await createMemberToken({ label: "Owner automation" });
    const current = listMemberTokens(true);
    finishOld(json({ tokens: [] }));
    const expected = [{ token_id: "new" }];
    await expect(Promise.all([previous, current])).resolves.toEqual([expected, expected]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects a late read from a replaced workspace without affecting the new session", async () => {
    rememberSession(createSession({ organization_id: "first" }));
    let finishFirst!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockImplementationOnce(async () => json({ projects: [] }));
    vi.stubGlobal("fetch", fetch);

    const previous = listProjects();
    const abandoned = expect(previous).rejects.toThrow("invalid_session");
    rememberSession(createSession({ organization_id: "second" }));
    await listProjects();
    finishFirst(json({ error: "invalid_session" }, { status: 401 }));
    await abandoned;
    await expect(listProjects()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("starts fresh workspace reads while old requests drain, without sending old queued reads", async () => {
    rememberSession(createSession({ organization_id: "old" }));
    const respond: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((resolve) => respond.push(resolve)));
    vi.stubGlobal("fetch", fetch);
    const old = Promise.allSettled(Array.from({ length: 6 }, (_, i) => listProjects(String(i))));
    expect(fetch).toHaveBeenCalledTimes(4);
    rememberSession(createSession({ organization_id: "new" }));
    const current = listProjects();
    expect(fetch).toHaveBeenCalledTimes(5);
    respond[4]!(json({ projects: [] }));
    await expect(current).resolves.toEqual([]);
    for (const finish of respond.slice(0, 4)) finish(json({ projects: [] }));
    for (const result of await old)
      expect(result).toMatchObject({ status: "rejected", reason: { message: "invalid_session" } });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("bounds a cold navigation burst and holds queued requests when the API asks it to back off", async () => {
    rememberSession(createSession());
    const respond: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((resolve) => respond.push(resolve)));
    vi.stubGlobal("fetch", fetch);
    const reads = Array.from({ length: 9 }, (_, i) => listProjects(String(i)));
    const results = Promise.allSettled(reads);
    expect(fetch).toHaveBeenCalledTimes(4);
    respond[0]!(json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "12" } }));
    await expect(reads[0]).rejects.toMatchObject({ status: 429 });
    for (const finish of respond.slice(1)) finish(json({ projects: [] }));
    const finished = await results;
    expect(finished.filter((read) => read.status === "fulfilled")).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("backs off other managed reads until Retry-After permits a request", async () => {
    rememberSession(createSession());
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () =>
        json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "12" } })
      )
      .mockImplementationOnce(async () => json({ tokens: [] }));
    vi.stubGlobal("fetch", fetch);

    await expect(listProjects()).rejects.toMatchObject({ status: 429, retryAfterMs: 12_000 });
    now.mockReturnValue(3_000);
    await expect(listMemberTokens()).rejects.toMatchObject({ status: 429, retryAfterMs: 9_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    now.mockReturnValue(12_000);
    await expect(listMemberTokens()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
