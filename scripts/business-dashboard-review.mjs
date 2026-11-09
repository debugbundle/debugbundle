import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire("/tmp/browser/package.json")("playwright");
const fixtures = JSON.parse(await readFile("/evidence/dashboard-fixtures.json", "utf8"));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const path = resolve("/app", extname(pathname) ? `.${pathname}` : "index.html");
  try {
    assert(path.startsWith("/app/"));
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce", colorScheme: "light" });
    const errors = [],
      unknown = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/v1/")) {
        const body = fixtures.responses[url.pathname];
        if (route.request().method() !== "GET" || !body) {
          unknown.push(`${route.request().method()} ${url.pathname}`);
          return route.fulfill({ status: 404, json: { error: "visual_fixture_missing" } });
        }
        return route.fulfill({ status: 200, json: body });
      }
      return url.origin === origin ? route.continue() : route.abort();
    });
    for (const entry of [
      { name: "people", path: "/settings/people", ready: "Invite person" },
      { name: "reports", path: "/reports", ready: "New report" },
      { name: "report-editor", path: fixtures.editorPath, ready: "Report name" },
      { name: "report-detail", path: fixtures.reportPath, ready: "Monthly review" },
      { name: "referrals", path: "/settings/referrals", ready: "Join referral programme" },
      { name: "billing", path: "/billing", ready: "Business" }
    ]) {
      await page.goto(origin + entry.path, { waitUntil: "networkidle" });
      await page.getByText(entry.ready, { exact: true }).first().waitFor();
      assert.equal(
        await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth),
        true,
        `${entry.name} page overflow`
      );
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/dashboard-${viewport.name}-${entry.name}.png`
      });
      if (entry.name === "people") {
        await page.getByRole("button", { name: "Invite person", exact: true }).click();
        await page.getByRole("dialog").waitFor();
        assert.equal(
          await page
            .getByRole("dialog")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
          true,
          "Invite dialog horizontal overflow"
        );
        const allProjects = page.getByRole("radio", {
          name: "All current and future",
          exact: true
        });
        await allProjects.waitFor();
        const box = await allProjects.boundingBox();
        assert(
          box && box.x >= 0 && box.x + box.width <= viewport.width,
          "Project access choice clipped"
        );
        await page.screenshot({
          animations: "disabled",
          path: `/evidence/dashboard-${viewport.name}-invite.png`
        });
        await page.keyboard.press("Escape");
      }
      if (entry.name === "billing") {
        await page
          .getByRole("button", { name: "Change plan or billing interval", exact: true })
          .click();
        await page.getByRole("dialog").waitFor();
        assert.equal(
          await page
            .getByRole("radio", { name: "Yearly", exact: true })
            .getAttribute("aria-checked"),
          "true"
        );
        assert.equal(
          await page
            .getByRole("dialog")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
          true,
          "Billing dialog overflow"
        );
        await page.screenshot({
          animations: "disabled",
          path: `/evidence/dashboard-${viewport.name}-billing-change.png`
        });
        await page.keyboard.press("Escape");
      }
      evidence.push({ viewport: viewport.name, page: entry.name, noPageOverflow: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(unknown, []);
    await page.close();
  }
  await writeFile("/evidence/dashboard-checks.json", JSON.stringify(evidence, null, 2) + "\n");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
