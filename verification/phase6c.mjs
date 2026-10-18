import assert from "node:assert/strict";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.cwd();
const port = 3116;
const base = `http://127.0.0.1:${port}`;
const db = "/tmp/lakowe-phase6c.db";
const artifacts = "verification/artifacts";
const results = { phase: "6C", database: "isolated copy", checks: [], startedAt: new Date().toISOString() };
let server;

function check(name, detail) { results.checks.push({ name, status: "passed", detail }); }
function fail(name, error) { results.checks.push({ name, status: "failed", detail: error instanceof Error ? error.message : String(error) }); }
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}
async function post(path, body, headers = {}) {
  return request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
async function expectStatus(promise, status, message) {
  const { response, body } = await promise;
  assert.equal(response.status, status, `${message}: expected HTTP ${status}, got ${response.status}: ${body?.error || ""}`);
  return body;
}
async function session(actorId) {
  const { response, body } = await post("/api/demo/session", { actorId });
  assert.equal(response.status, 200, `could not create ${actorId} session`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "session did not return a cookie");
  return { cookie, actorId, body };
}
async function demo(actor, body) {
  return post("/api/demo", { ...body, actorId: actor.actorId }, { cookie: actor.cookie });
}
async function snapshot() {
  return expectStatus(request("/api/demo"), 200, "snapshot");
}
async function createWalletSale(key, customer = "Phase 6C isolated") {
  const body = await expectStatus(post("/api/wallet", {
    action: "checkout", outletId: "clubhouse", customerName: customer,
    items: [{ itemId: "malt", quantity: 1, choices: [] }], idempotencyKey: key,
  }), 200, "wallet checkout");
  const all = await snapshot();
  const transaction = all.transactions.find(row => row.orderReference === body.order.reference);
  assert.ok(transaction, "created wallet sale has no transaction");
  return { order: body.order, transaction };
}
async function start() {
  server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: `file:${db}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/wallet`);
      if (response.ok) return;
    } catch { /* wait for the production server */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`production server did not start: ${output}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise(resolve => server.once("exit", resolve));
}
async function wallet() { return expectStatus(request("/api/wallet"), 200, "wallet snapshot"); }

async function browserFlow(browserSale) {
  const browser = await chromium.launch({ executablePath: process.env.PHASE6C_CHROMIUM_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/staff/login`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Enter staff demo" }).click();
    await page.waitForURL(`${base}/staff`);
    await page.goto(`${base}/staff/transactions`, { waitUntil: "networkidle" });
    const row = page.locator("tr").filter({ hasText: browserSale.transaction.id });
    await row.getByRole("button", { name: "Request action" }).click();
    await page.getByRole("button", { name: "Wallet refund" }).click();
    await page.locator("textarea").fill("Browser staff refund request");
    await page.getByRole("button", { name: "Send approval request" }).click();
    await page.getByText("Approval request sent to a supervisor.").waitFor();
    await page.screenshot({ path: `${artifacts}/phase6c-staff-request.png`, fullPage: true });

    await page.goto(`${base}/staff/login`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Kemi Okafor/ }).click();
    await page.getByRole("button", { name: "Enter staff demo" }).click();
    await page.waitForURL(`${base}/staff`);
    await page.goto(`${base}/staff/approvals`, { waitUntil: "networkidle" });
    const card = page.locator("article").filter({ hasText: browserSale.transaction.id });
    await card.locator("input").fill("Browser supervisor approval");
    await card.getByRole("button", { name: "Approve refund" }).click();
    await page.getByText("Refund approved.").waitFor();
    await page.screenshot({ path: `${artifacts}/phase6c-supervisor-approval.png`, fullPage: true });

    await page.goto(`${base}/wallet`, { waitUntil: "networkidle" });
    await page.getByText(`Approved demo refund for ${browserSale.order.reference}`).waitFor();
    await page.screenshot({ path: `${artifacts}/phase6c-wallet-history.png`, fullPage: true });

    await page.goto(`${base}/management`, { waitUntil: "networkidle" });
    await page.getByText("Management dashboard").waitFor();
    await page.getByText(browserSale.transaction.id).waitFor();
    await page.screenshot({ path: `${artifacts}/phase6c-management-reconciliation.png`, fullPage: true });
  } finally {
    await browser.close();
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  await rm(db, { force: true });
  await copyFile("prisma/dev.db", db);
  await start();

  const ade = await session("staff-ade");
  const kemi = await session("supervisor-kemi");
  const zainab = await session("staff-zainab");
  await expectStatus(post("/api/wallet", { action: "deposit", amount: 20_000_000, idempotencyKey: "phase6c-isolated-deposit" }), 200, "isolated deposit");
  const originalWallet = await wallet();

  const rejected = await createWalletSale("phase6c-rejected-sale");
  const rejectedRequest = await expectStatus(demo(ade, { action: "requestWalletRefund", transactionId: rejected.transaction.id, reason: "Rejected-flow verification" }), 200, "request rejected-flow refund");
  await expectStatus(demo(kemi, { action: "decideWalletRefund", requestId: rejectedRequest.data.id, decision: "rejected", reason: "Refund does not meet policy" }), 200, "reject refund");
  const afterRejected = await wallet();
  assert.equal(afterRejected.balance, originalWallet.balance - rejected.transaction.amount, "rejected refund changed wallet balance");
  assert.equal(afterRejected.entries.filter(entry => entry.type === "refund" && entry.orderReference === rejected.order.reference).length, 0, "rejected refund created a ledger credit");
  check("Rejected refund requests", "Supervisor rejection persisted without wallet credit.");

  const self = await createWalletSale("phase6c-self-sale");
  const selfRequest = await expectStatus(demo(kemi, { action: "requestWalletRefund", transactionId: self.transaction.id, reason: "Self-approval prevention verification" }), 200, "create supervisor refund request");
  await expectStatus(demo(kemi, { action: "decideWalletRefund", requestId: selfRequest.data.id, decision: "approved", reason: "Attempt self approval" }), 403, "self approval prevention");
  check("Self-approval prevention", "Supervisor could request but could not decide their own refund.");

  const unauthorized = await createWalletSale("phase6c-unauthorized-sale");
  await expectStatus(post("/api/demo", { action: "requestWalletRefund", actorId: "staff-ade", transactionId: unauthorized.transaction.id, reason: "Guest access" }), 401, "guest refund request");
  await expectStatus(demo(zainab, { action: "requestWalletRefund", transactionId: unauthorized.transaction.id, reason: "Wrong outlet" }), 403, "wrong outlet refund request");
  await expectStatus(post("/api/demo", { action: "requestWalletRefund", actorId: "supervisor-kemi", transactionId: unauthorized.transaction.id, reason: "Spoofed actor" }, { cookie: ade.cookie }), 403, "spoofed refund actor");
  check("Unauthorized outlet and guest access", "Anonymous, cross-outlet, and body-spoofed refund requests were denied.");

  const concurrent = await createWalletSale("phase6c-concurrent-sale");
  const concurrentRequest = await expectStatus(demo(ade, { action: "requestWalletRefund", transactionId: concurrent.transaction.id, reason: "Concurrent decision verification" }), 200, "create concurrent refund request");
  const decisions = await Promise.all([
    demo(kemi, { action: "decideWalletRefund", requestId: concurrentRequest.data.id, decision: "approved", reason: "Concurrent approval A" }),
    demo(kemi, { action: "decideWalletRefund", requestId: concurrentRequest.data.id, decision: "approved", reason: "Concurrent approval B" }),
  ]);
  assert.deepEqual(decisions.map(item => item.response.status).sort(), [200, 409], "concurrent approvals must have exactly one winner");
  const afterConcurrent = await wallet();
  assert.equal(afterConcurrent.entries.filter(entry => entry.type === "refund" && entry.orderReference === concurrent.order.reference).length, 1, "concurrent approval created more than one refund credit");
  check("Concurrent approvals", "Exactly one concurrent approval credited the wallet; the other conflicted.");

  const restartSale = await createWalletSale("phase6c-restart-sale");
  const restartRequest = await expectStatus(demo(ade, { action: "requestWalletRefund", transactionId: restartSale.transaction.id, reason: "Restart persistence verification" }), 200, "create restart refund request");
  await stop();
  await start();
  const afterRestart = await snapshot();
  assert.equal(afterRestart.refunds.find(row => row.id === restartRequest.data.id)?.status, "pending", "pending refund did not survive production restart");
  check("Restart persistence", "Pending refund request survived an isolated production-server restart.");

  const sageSale = await createWalletSale("phase6c-sage-sale");
  const prepared = await expectStatus(post("/api/management/sage", { action: "prepare", transactionId: sageSale.transaction.id, scenario: "success" }, { "x-demo-user-id": kemi.actorId }), 200, "prepare Sage record");
  assert.equal(prepared.result.sync.reconciliationState, "not_required", "fresh Sage record was not initially reconciled");
  const sageRequest = await expectStatus(demo(ade, { action: "requestWalletRefund", transactionId: sageSale.transaction.id, reason: "Sage reversal verification" }), 200, "request Sage-linked refund");
  await expectStatus(demo(kemi, { action: "decideWalletRefund", requestId: sageRequest.data.id, decision: "approved", reason: "Sage refund approval" }), 200, "approve Sage-linked refund");
  const sageReport = await expectStatus(request("/api/management/sage", { headers: { "x-demo-user-id": kemi.actorId } }), 200, "Sage report after refund");
  const sageRecord = sageReport.report.records.find(row => row.id === prepared.result.sync.id);
  assert.ok(sageRecord, "prepared Sage record disappeared after refund");
  assert.equal(sageRecord.reconciliationState, "refund_reversal_required", "approved refund did not require Sage reversal");
  assert.equal(sageRecord.reversalAmount, sageSale.transaction.amount, "Sage reversal amount did not equal refunded amount");
  assert.equal(sageRecord.reversalReference, sageRequest.data.id, "Sage reversal did not retain refund request reference");
  check("Sage reversal-required behavior", "Approved refund marked its pre-prepared Sage record refund_reversal_required with amount and request reference.");

  const browserSale = await createWalletSale("phase6c-browser-sale", "Phase 6C browser flow");
  await browserFlow(browserSale);
  const afterBrowser = await wallet();
  assert.equal(afterBrowser.entries.filter(entry => entry.type === "refund" && entry.orderReference === browserSale.order.reference).length, 1, "browser approval did not create refund history");
  check("Staff and supervisor browser interactions", "Staff requested and supervisor approved a wallet refund through the production UI.");
  check("Wallet refund history", "Wallet UI displayed the approved refund and persisted ledger credit.");

  const report = await expectStatus(request("/api/management/report?status=refunded", { headers: { "x-demo-user-id": kemi.actorId } }), 200, "management refund reconciliation report");
  const refundedIds = new Set([concurrent.transaction.id, sageSale.transaction.id, browserSale.transaction.id]);
  const rows = report.report.recentTransactions.filter(row => refundedIds.has(row.id));
  assert.equal(rows.length, refundedIds.size, "management report did not include every approved refund");
  assert.ok(rows.every(row => row.transactionStatus === "refunded" && row.eligibleAmount === null), "refunded sales were still recognized as eligible revenue");
  assert.equal(report.report.summary.totalEligibleSales, 0, "refunded-only management report has eligible sales");
  check("Management financial reconciliation", "Refunded transactions appear as non-eligible revenue in the management report.");

  results.finishedAt = new Date().toISOString();
  await writeFile(`${artifacts}/phase6c-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  fail("Phase 6C runner", error);
  results.finishedAt = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(`${artifacts}/phase6c-results.json`, JSON.stringify(results, null, 2));
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  await stop();
}
