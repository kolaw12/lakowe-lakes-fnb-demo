import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const base = process.env.STATEMENT_BASE_URL || "http://127.0.0.1:3103";
const artifacts = new URL("./artifacts/", import.meta.url).pathname;
await mkdir(artifacts, { recursive: true });
const checks = [];
const pass = name => { checks.push(name); console.log("PASS", name); };
const hash = async () => createHash("sha256").update(await readFile("prisma/dev.db")).digest("hex");
const before = await hash();
const db = new PrismaClient();
let ledger;
try {
  ledger = await db.walletLedgerEntry.findMany({ orderBy: { createdAt: "asc" } });
} finally {
  await db.$disconnect();
}
const purchase = ledger.find(row => row.type === "purchase" && row.amount === -350000 && row.status === "posted");
const deposit = ledger.find(row => row.type === "deposit" && row.amount === 20000000);
assert.ok(purchase);
assert.ok(deposit);
pass("Existing persisted records: 350000-kobo purchase and 20000000-kobo deposit");
const day = purchase.createdAt.toISOString().slice(0, 10);
const beforeDay = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
const afterDay = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
const naira = kobo => "₦" + (kobo / 100).toLocaleString("en-NG");
function pdfText(file) {
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
}
function checkCSV(text, total) {
  assert.ok(text.includes("Total,,,,,," + total));
  assert.ok(!text.includes(deposit.reference));
  assert.ok(!text.includes("20000000"));
  assert.equal(text.split("\n").filter(line => line.includes(purchase.orderReference)).length, total ? 1 : 0);
}
function checkPDF(file, total) {
  const text = pdfText(file);
  assert.ok(text.includes("Total eligible expenditure: " + naira(total)), text);
  assert.ok(!text.includes("200,000"));
  assert.equal(text.split(purchase.orderReference).length - 1, total ? 1 : 0);
  if (total) assert.equal(text.split("₦3,500").length - 1, 2);
}

const cases = [
  ["all", {}, 350000],
  ["clubhouse", { outlet: "clubhouse" }, 350000],
  ["revivo", { outlet: "revivo" }, 0],
  ["same-day-wallet", { from: day, to: day, payment: "wallet_demo" }, 350000],
  ["before-purchase", { to: beforeDay }, 0],
  ["after-purchase", { from: afterDay }, 0],
  ["wallet", { payment: "wallet_demo" }, 350000],
];
for (const [name, filters, total] of cases) {
  const query = new URLSearchParams(filters);
  const response = await fetch(base + "/api/wallet/statements?" + query);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, total);
  assert.ok(!("entries" in data));
  assert.equal(data.rows.length, total ? 1 : 0);
  if (total) {
    assert.equal(data.rows[0].reference, purchase.reference);
    assert.equal(data.rows[0].outlet, "The Clubhouse");
  }
  query.set("format", "csv");
  const csv = await fetch(base + "/api/wallet/statements?" + query);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const csvText = await csv.text();
  checkCSV(csvText, total);
  await writeFile(artifacts + name + ".csv", csvText);
  query.set("format", "pdf");
  const pdf = await fetch(base + "/api/wallet/statements?" + query);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type"), /application\/pdf/);
  const file = artifacts + name + ".pdf";
  await writeFile(file, Buffer.from(await pdf.arrayBuffer()));
  checkPDF(file, total);
  pass(name + ": API, CSV and PDF totals match (" + naira(total) + ")");
}
const fontReport = execFileSync("pdffonts", [artifacts + "all.pdf"], { encoding: "utf8" });
assert.match(fontReport, /NotoSans-Regular.*yes\s+yes\s+yes/);
await writeFile(artifacts + "pdf-fonts.txt", fontReport);
execFileSync("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1400", "-png", artifacts + "all.pdf", artifacts + "pdf-preview"]);
pass("PDF embeds a Noto Sans subset with Unicode mapping; ₦3,500 appears twice");
for (const filters of [
  { from: "2026-02-30" }, { from: afterDay, to: beforeDay }, { from: "bad" },
  { payment: "cash" }, { to: day + "T00:00:00Z" },
]) {
  for (const format of ["json", "csv", "pdf"]) {
    const query = new URLSearchParams({ ...filters, format });
    const response = await fetch(base + "/api/wallet/statements?" + query);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Invalid statement filters.");
  }
}
pass("Invalid date ranges, malformed dates and unsupported payment rejected in every format");

const browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.STATEMENT_CHROMIUM_PATH });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  // Hold a real response after network completion and deliberately ignore cancellation,
  // so the race test also proves protection when AbortController cannot stop a response.
  await context.addInitScript(() => {
    window.statementTest = { holdOutlet: null, held: [], holdError: false, delivered: 0 };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const state = window.statementTest;
      const hold = url.pathname === "/api/wallet/statements" && !url.searchParams.has("format") &&
        state.holdOutlet && url.searchParams.get("outlet") === state.holdOutlet;
      if (!hold) return originalFetch(input, init);
      const response = await originalFetch(input, { ...init, signal: undefined });
      const shouldFail = state.holdError;
      await new Promise(resolve => state.held.push(resolve));
      state.delivered++;
      return shouldFail ? new Response(JSON.stringify({ error: "Obsolete request error" }), { status: 500 }) : response;
    };
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const summary = page.locator("section[aria-busy]");
  const amount = summary.locator("p.text-3xl");
  async function ready(total) {
    await expect(summary).toHaveAttribute("aria-busy", "false");
    await expect(amount).toHaveText(naira(total));
    await expect(page.locator("article")).toHaveCount(total ? 1 : 0);
  }
  async function apply(filters, total) {
    await page.getByLabel("Start date").fill(filters.from || "");
    await page.getByLabel("End date").fill(filters.to || "");
    await page.getByLabel("Outlet").selectOption(filters.outlet || "");
    await page.getByLabel("Payment").selectOption(filters.payment || "");
    const response = page.waitForResponse(r => r.url().includes("/api/wallet/statements?") && !r.url().includes("format="));
    await page.getByRole("button", { name: "Apply filters" }).click();
    await response;
    await ready(total);
  }
  async function download(format, total, name) {
    const requestPromise = page.waitForRequest(r => r.url().includes("format=" + format));
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: format.toUpperCase(), exact: true }).click();
    const request = await requestPromise;
    const result = await downloaded;
    assert.equal(await result.failure(), null);
    const file = artifacts + name + "." + format;
    await result.saveAs(file);
    if (format === "csv") checkCSV(await readFile(file, "utf8"), total);
    else checkPDF(file, total);
    await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeEnabled();
    return new URL(request.url()).searchParams;
  }
  await page.goto(base + "/wallet/statements");
  await ready(350000);
  await expect(page.locator("article")).toContainText("The Clubhouse");
  await expect(page.locator("article")).toContainText(purchase.orderReference);
  await expect(page.locator("main")).not.toContainText("200,000");
  await page.screenshot({ path: artifacts + "statement-ui.png", fullPage: true });
  pass("UI shows existing Clubhouse ₦3,500 purchase and excludes ₦200,000 deposit");

  for (const [name, filters, total] of cases) {
    await apply(filters, total);
    await download("csv", total, "ui-" + name);
    await download("pdf", total, "ui-" + name);
    pass(name + ": actual UI CSV/PDF downloads match displayed total");
  }
  await apply({ from: day, to: day, outlet: "clubhouse", payment: "wallet_demo" }, 350000);
  await page.getByLabel("Start date").fill(afterDay);
  await page.getByLabel("End date").fill(afterDay);
  await page.getByLabel("Outlet").selectOption("revivo");
  await page.getByLabel("Payment").selectOption("");
  await expect(summary).toContainText(day + " to " + day);
  for (const format of ["csv", "pdf"]) {
    const query = await download(format, 350000, "unsaved-" + format);
    assert.equal(query.get("from"), day);
    assert.equal(query.get("to"), day);
    assert.equal(query.get("outlet"), "clubhouse");
    assert.equal(query.get("payment"), "wallet_demo");
  }
  pass("Unsaved date/outlet/payment inputs do not change displayed period or export filters");

  const matcher = "**/api/wallet/statements?*";
  const failJSON = route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Statement service unavailable" }) });
  await page.route(matcher, failJSON);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Statement service unavailable");
  await ready(350000);
  await page.unroute(matcher, failJSON);
  const failedQuery = await download("csv", 350000, "failed-apply-retained");
  assert.equal(failedQuery.get("outlet"), "clubhouse");
  assert.equal(failedQuery.get("from"), day);
  pass("Failed apply visibly reports HTTP error and retains last successful data and export query");

  for (const mode of ["http-json", "http-text", "network"]) {
    const handler = mode === "http-json" ? failJSON : mode === "http-text"
      ? route => route.fulfill({ status: 502, contentType: "text/plain", body: "Gateway failed" })
      : route => route.abort("failed");
    await page.route(matcher, handler);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).not.toBeEmpty();
    await expect(summary).toHaveAttribute("aria-busy", "false");
    await page.unroute(matcher, handler);
    pass("Fetch failure visible: " + mode);
  }
  await apply({ outlet: "clubhouse" }, 350000);
  for (const format of ["csv", "pdf"]) {
    for (const mode of ["http-json", "http-text", "network"]) {
      const handler = mode === "http-json" ? failJSON : mode === "http-text"
        ? route => route.fulfill({ status: 502, contentType: "text/plain", body: "Gateway failed" })
        : route => route.abort("failed");
      await page.route(matcher, handler);
      await page.getByRole("button", { name: format.toUpperCase(), exact: true }).click();
      await expect(page.locator("main").getByRole("alert")).toBeVisible();
      await expect(page.locator("main").getByRole("alert")).not.toBeEmpty();
      await expect(page.getByRole("button", { name: format.toUpperCase(), exact: true })).toBeEnabled();
      await page.unroute(matcher, handler);
      pass(format.toUpperCase() + " download failure visible: " + mode);
    }
  }
  await download("pdf", 350000, "recovered-download");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Start date").fill(afterDay);
  await page.getByLabel("End date").fill(beforeDay);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("End date cannot be before start date.");
  pass("UI validates reversed dates and recovers after download failures");

  for (const staleError of [false, true]) {
    await apply({ outlet: "clubhouse" }, 350000);
    await page.evaluate(error => {
      window.statementTest.holdOutlet = "revivo";
      window.statementTest.holdError = error;
    }, staleError);
    await page.getByLabel("Outlet").selectOption("revivo");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.waitForFunction(() => window.statementTest.held.length === 1);
    await apply({ outlet: "clubhouse" }, 350000);
    await page.evaluate(() => {
      window.statementTest.holdOutlet = null;
      window.statementTest.held.splice(0).forEach(release => release());
    });
    await page.waitForFunction(expected => window.statementTest.delivered === expected, staleError ? 2 : 1);
    // Drain fetch/JSON microtasks and React rendering after the obsolete response completes.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await ready(350000);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    const query = await download("csv", 350000, staleError ? "stale-error" : "stale-success");
    assert.equal(query.get("outlet"), "clubhouse");
    pass(staleError ? "Obsolete error cannot replace current error/loading/data state" : "Obsolete successful response cannot overwrite newer filters, total or export query");
  }
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await ready(350000);
  await expect(page.getByLabel("Outlet")).toHaveValue("");
  const resetQuery = await download("pdf", 350000, "reset");
  assert.equal(resetQuery.get("outlet"), null);
  pass("Reset restores unfiltered statement and exports");
  const failedPage = await context.newPage();
  await failedPage.route(matcher, failJSON);
  await failedPage.goto(base + "/wallet/statements");
  await expect(failedPage.locator("main").getByRole("alert")).toHaveText("Statement service unavailable");
  await expect(failedPage.getByRole("button", { name: "CSV", exact: true })).toBeDisabled();
  await expect(failedPage.getByRole("button", { name: "PDF", exact: true })).toBeDisabled();
  await expect(failedPage.locator("section")).toContainText("Statement unavailable");
  await failedPage.screenshot({ path: artifacts + "statement-error.png", fullPage: true });
  pass("Initial fetch failure is visible; exports disabled before any successful response");
  assert.deepEqual(pageErrors, []);
  pass("No browser runtime exceptions");
} finally {
  await browser.close();
}
assert.equal(await hash(), before);
pass("Persisted database unchanged (SHA-256 before/after matches)");
await writeFile(artifacts + "results.json", JSON.stringify({ base, verifiedAt: new Date().toISOString(), purchaseReference: purchase.reference, depositReference: deposit.reference, databaseSHA256: before, checks }, null, 2));
console.log("All " + checks.length + " statement verification checks passed.");
