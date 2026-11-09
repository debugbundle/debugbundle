import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire("/tmp/browser/package.json")("playwright");
const reference = process.env.REVIEW_MODE === "reference";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain"
};
const server = createServer(async (request, response) => {
  try {
    let path = resolve(
      "/site",
      `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`
    );
    assert(path.startsWith("/site/"));
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport, colorScheme: "light", reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (!reference)
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
      );
    await page.goto(reference ? "https://sentry.io/pricing/" : `${origin}/pricing/`, {
      waitUntil: "networkidle"
    });
    await page.screenshot({
      animations: "disabled",
      path: `/evidence/${reference ? "sentry" : "pricing"}-${viewport.name}-top.png`
    });
    if (reference) {
      await writeFile(
        `/evidence/sentry-${viewport.name}.txt`,
        await page.locator("body").innerText()
      );
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/sentry-${viewport.name}-full.png`,
        fullPage: true
      });
    } else {
      await assert.equal(await page.getByRole("radio", { name: /yearly/i }).isChecked(), true);
      await assert.equal(
        await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth),
        true
      );
      const business = page.locator('section[aria-labelledby="plan-business"]');
      await assert.match(await business.innerText(), /\$49\s*\/mo/);
      await assert.match(await business.innerText(), /\$588 billed yearly/);
      for (const [tier, monthly, yearly] of [
        ["solo", 4, 48],
        ["team", 16, 192],
        ["business", 49, 588]
      ]) {
        const card = await page.locator(`section[aria-labelledby="plan-${tier}"]`).innerText();
        assert(card.includes(`$${monthly}/mo`));
        assert(card.includes(`$${yearly} billed yearly`));
        assert.doesNotMatch(card, /\$\d+\.\d+/);
      }
      const comparison = await page.locator("#compare-plans").innerText();
      assert(comparison.includes("$10/year"));
      assert.equal((comparison.match(/\$30\/year/g) ?? []).length, 2);
      await page.getByText("Monthly", { exact: true }).click();
      await assert.match(await business.innerText(), /\$59/);
      await page.getByText("Yearly · Save", { exact: true }).click();
      await page.getByRole("radio", { name: /yearly/i }).focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.getByRole("radio", { name: /monthly/i }).isChecked(), true);
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.getByRole("radio", { name: /yearly/i }).isChecked(), true);
      await business.scrollIntoViewIfNeeded();
      const ctaColours = await business.getByRole("link").evaluate((element) => {
        const style = getComputedStyle(element);
        return { text: style.color, background: style.backgroundColor };
      });
      assert.notEqual(ctaColours.text, ctaColours.background);
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-business.png`
      });
      await page
        .locator("#compare-plans")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-comparison.png`
      });
      await page
        .getByRole("region", { name: "DebugBundle plan features and shared monthly allowances" })
        .evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-comparison-business.png`
      });
      await page.locator("#pricing-faq").scrollIntoViewIfNeeded();
      const firstQuestion = page.locator("#pricing-faq summary").first();
      await firstQuestion.focus();
      await page.keyboard.press("Enter");
      await assert.equal(
        await page.locator("#pricing-faq details").first().getAttribute("open"),
        ""
      );
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-faq.png`
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.locator("html.dark").waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-dark.png`
      });
      await business.scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: `/evidence/pricing-${viewport.name}-business-dark.png`
      });
      assert.deepEqual(errors, []);
      evidence.push({
        viewport: viewport.name,
        annualDefault: true,
        monthlySwitch: true,
        faqKeyboard: true,
        radioKeyboard: true,
        lightAndDark: true,
        businessCtaColours: ctaColours,
        noPageOverflow: true,
        pageErrors: errors
      });
    }
    await page.close();
  }
  await writeFile(
    `/evidence/${reference ? "reference" : "pricing"}-checks.json`,
    JSON.stringify(evidence, null, 2) + "\n"
  );
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
