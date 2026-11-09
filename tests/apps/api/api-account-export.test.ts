import { expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import { createTokenApiServer, type ApiServerDependencies } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
const org = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
function fixture(role = "owner") {
  const read = vi.fn().mockResolvedValue({
    section: "report_runs",
    as_of: "2026-11-07T00:00:00.000Z",
    items: [],
    next_cursor: null
  });
  const app = createTokenApiServer({
    accountManagement: mockedObject<NonNullable<ApiServerDependencies["accountManagement"]>>({
      exportBusinessAccountSection: read
    }),
    webAuth: {
      resolveSessionByToken: vi
        .fn()
        .mockResolvedValue({ user_id: user, organization_id: org, role })
    }
  });
  const request = (query = "section=report_runs") =>
    app.inject({
      method: "GET",
      url: `/v1/account/export?${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=owner-session` }
    });
  return { app, read, request };
}
it("exports a bounded section using only the current browser Owner identity", async () => {
  const f = fixture(),
    response = await f.request("section=report_runs&limit=2");
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["content-disposition"]).toContain("debugbundle-account-report_runs.json");
  expect(f.read).toHaveBeenCalledWith({
    organization_id: org,
    user_id: user,
    query: { section: "report_runs", limit: 2 }
  });
  expect(
    (
      await f.app.inject({
        method: "GET",
        url: "/v1/account/export?section=report_runs",
        headers: { authorization: "Bearer member-secret" }
      })
    ).statusCode
  ).toBe(401);
});
it.each(["admin", "member"])("does not widen account export to %s", async (role) => {
  const f = fixture(role);
  expect((await f.request()).statusCode).toBe(403);
  expect(f.read).not.toHaveBeenCalled();
});
it("rejects unknown sections, oversized pages and cursor injection without calling the store", async () => {
  const f = fixture();
  for (const query of [
    "section=provider_receipts",
    "section=report_runs&limit=101",
    "section=report_runs&cursor=../../secret",
    "organization_id=foreign",
    "cursor=eA"
  ]) {
    expect((await f.request(query)).statusCode).toBe(400);
  }
  expect(f.read).not.toHaveBeenCalled();
});
it("returns safe cursor and unavailable errors and honours current-role loss", async () => {
  const f = fixture();
  f.read.mockRejectedValueOnce(new Error("invalid_account_export_cursor"));
  expect((await f.request()).json()).toEqual({ error: "invalid_account_export_cursor" });
  f.read.mockRejectedValueOnce(new Error("secret-database-details"));
  const failed = await f.request();
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain("secret-database-details");
  f.read.mockResolvedValueOnce(null);
  expect((await f.request()).statusCode).toBe(404);
});
