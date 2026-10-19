import assert from "node:assert/strict";
import { mkdtemp, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import vm from "node:vm";
import ts from "typescript";
import { chromium } from "@playwright/test";
import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { migrate } from "../scripts/migrate-turso.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "lakowe-persistence-"));
const databaseUrl = `file:${path.join(directory, "records.db")}`;
const base = "http://127.0.0.1:3142";
const otherBase = "http://127.0.0.1:3143";
const storageKey = "lakowe-fnb-demo-v1";
const servers = new Set();
const require = createRequire(import.meta.url);
let browser;
let serverLog = "";
const passed = name => console.log(`PASS ${name}`);

async function start(port) {
  const env = { ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl };
  for (const key of ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) delete env[key];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  servers.add(server);
  server.stdout.on("data", data => { serverLog += data; });
  server.stderr.on("data", data => { serverLog += data; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw Error(`Server exited: ${serverLog}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/demo`)).ok) return server; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(`Server did not start: ${serverLog}`);
}

async function stop(server) {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 10000);
    try { await exited; } finally { clearTimeout(timeout); }
  }
  servers.delete(server);
}

async function json(url, body) {
  const response = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
}

async function storage(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function setCart(page, items) {
  await page.evaluate(({ key, items }) => {
    const state = JSON.parse(localStorage.getItem(key) || '{"orders":[]}');
    localStorage.setItem(key, JSON.stringify({ ...state, cart: items }));
  }, { key: storageKey, items });
  await page.goto(`${base}/dining/checkout?outlet=clubhouse`);
  await page.getByPlaceholder("e.g. Tunde Adeyemi").waitFor();
}

const malt = { key: "malt-", itemId: "malt", quantity: 1, choices: [] };
const rose = { key: "rose-", itemId: "rose", quantity: 1, choices: [] };

try {
  const migrationClient = createClient({ url: databaseUrl });
  await migrate(migrationClient);
  await migrate(migrationClient);
  assert.equal((await migrationClient.execute('SELECT COUNT(*) AS count FROM "_lakowe_migrations"')).rows[0].count, 4);
  migrationClient.close();
  passed("cloud migrations initialize a fresh database and can be rerun");

  const adapterDb = new PrismaClient({ adapter: new PrismaLibSQL({ url: databaseUrl }) });
  const secondAdapter = new PrismaClient({ adapter: new PrismaLibSQL({ url: databaseUrl }) });
  try {
    await adapterDb.$transaction(async tx => {
      await tx.demoUser.create({ data: { id: "adapter-check", name: "Adapter check", role: "staff", outletIds: "[]" } });
    });
    assert.ok((await secondAdapter.demoUser.findUniqueOrThrow({ where: { id: "adapter-check" } })).createdAt instanceof Date);
    await assert.rejects(adapterDb.$transaction(async tx => {
      await tx.demoUser.delete({ where: { id: "adapter-check" } });
      throw Error("rollback-check");
    }), /rollback-check/);
    assert.ok(await secondAdapter.demoUser.findUnique({ where: { id: "adapter-check" } }));
  } finally { await adapterDb.$disconnect(); await secondAdapter.$disconnect(); }
  passed("libSQL adapter shares committed records and rolls back failed transactions");

  const source = await readFile("lib/prisma.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, process: { env: { VERCEL: "1", NODE_ENV: "production", DATABASE_URL: "file:/tmp/unsafe.db" } }, globalThis: {} });
  assert.throws(() => exports.prisma.order, /Configure TURSO_DATABASE_URL/);
  passed("serverless requests reject temporary SQLite fallback");

  let first = await start(3142);
  const second = await start(3143);
  let executablePath = process.env.STATEMENT_CHROMIUM_PATH;
  if (!executablePath) {
    try { await access("/usr/bin/google-chrome"); executablePath = "/usr/bin/google-chrome"; } catch {}
  }
  browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true });
  const context = await browser.newContext();
  const guest = await context.newPage();
  const guestErrors = [];
  guest.on("pageerror", error => guestErrors.push(error.message));
  await guest.goto(`${base}/dining`);
  await setCart(guest, [malt, rose]);
  const otherGuest = await context.newPage();
  await otherGuest.goto(`${base}/dining/orders`);
  await guest.getByPlaceholder("e.g. Tunde Adeyemi").fill("Persistence Guest");
  await guest.getByRole("button", { name: /Place order/ }).click();
  await guest.waitForURL(/\/dining\/orders\/LL-/);
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  const reference = new URL(guest.url()).pathname.split("/").pop();
  const receipt = (await storage(guest)).orders.find(order => order.reference === reference);
  assert.ok(receipt.verification.collectionCode);
  assert.deepEqual((await storage(guest)).cart, [rose]);
  await otherGuest.getByText(reference, { exact: true }).waitFor();
  passed("guest checkout synchronizes across tabs and keeps other-outlet basket items");

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await staff.goto(`${base}/staff`);
  await staff.getByText(reference, { exact: true }).waitFor();
  const snapshot = await json(`${otherBase}/api/demo`);
  assert.ok(snapshot.orders.some(order => order.reference === reference));
  assert.ok(snapshot.transactions.some(entry => entry.orderReference === reference));
  assert.ok(snapshot.audit.some(entry => entry.entityId === reference));
  passed("independent staff browser and second server see order, transaction and audit");

  await json(`${otherBase}/api/demo`, { action: "updateOrder", actorId: "staff-ade", reference, status: "preparing" });
  await guest.reload();
  await guest.getByText("The culinary team is preparing your dishes.", { exact: true }).waitFor();
  assert.deepEqual((await storage(guest)).orders.find(order => order.reference === reference).verification, receipt.verification);
  passed("staff updates reach the guest without losing collection credentials");

  await guest.route("**/api/demo", route => route.fulfill({ json: { orders: [] } }));
  await guest.reload();
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  assert.deepEqual((await storage(guest)).orders.find(order => order.reference === reference).verification, receipt.verification);
  await guest.unroute("**/api/demo");
  await guest.route("**/api/demo", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await guest.reload();
  await guest.getByRole("status").filter({ hasText: "Order updates are temporarily unavailable" }).waitFor();
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  await guest.unroute("**/api/demo");
  await staff.route("**/api/demo", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await staff.evaluate(() => window.dispatchEvent(new Event("focus")));
  await staff.getByRole("alert").waitFor();
  await staff.getByText(reference, { exact: true }).waitFor();
  await staff.unroute("**/api/demo");
  passed("empty/failed guest snapshots retain receipts; failed staff refresh retains queue");

  await json(`${base}/api/wallet`, { action: "deposit", amount: 5000000, idempotencyKey: "persistence-deposit" });
  await setCart(guest, [malt, rose]);
  await guest.getByPlaceholder("e.g. Tunde Adeyemi").fill("Wallet Guest");
  await guest.getByRole("button", { name: /Golfer wallet/ }).click();
  await guest.getByRole("button", { name: /Place order/ }).click();
  await guest.waitForURL(/\/dining\/orders\/LL-/);
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  const walletReference = new URL(guest.url()).pathname.split("/").pop();
  const walletReceipt = (await storage(guest)).orders.find(order => order.reference === walletReference);
  assert.ok(walletReceipt.verification.collectionCode);
  assert.deepEqual(walletReceipt.items[0].choices, []);
  assert.deepEqual((await storage(guest)).cart, [rose]);
  await guest.reload();
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  assert.deepEqual((await storage(guest)).orders.find(order => order.reference === walletReference).verification, walletReceipt.verification);
  passed("wallet checkout saves immediately, renders database items and keeps its handoff code after reload");

  await setCart(guest, [malt, rose]);
  await guest.getByPlaceholder("e.g. Tunde Adeyemi").fill("Room Guest");
  await guest.getByRole("button", { name: /Charge to room/ }).click();
  await guest.getByLabel("Demo room", { exact: true }).fill("101");
  await guest.getByLabel("Demo guest surname", { exact: true }).fill("Adebayo");
  await guest.getByLabel("Demo verification code", { exact: true }).fill("LAKE-101");
  const roomPayment = guest.waitForResponse(response => response.url().endsWith("/api/opera/room-charge") && response.request().method() === "POST");
  await guest.getByRole("button", { name: /Verify and charge room/ }).click();
  const roomPaymentResponse = await roomPayment;
  if (!roomPaymentResponse.ok()) assert.fail(await roomPaymentResponse.text());
  await guest.waitForURL(/\/dining\/orders\/LL-/);
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  const roomReference = new URL(guest.url()).pathname.split("/").pop();
  assert.ok((await storage(guest)).orders.find(order => order.reference === roomReference).verification.collectionCode);
  assert.deepEqual((await storage(guest)).cart, [rose]);
  passed("room-charge checkout retains the receipt, credentials and remaining basket through full navigation");

  const beforeRestart = await json(`${base}/api/demo`);
  const walletBeforeRestart = await json(`${base}/api/wallet`);
  await stop(first);
  first = await start(3142);
  const afterRestart = await json(`${base}/api/demo`);
  assert.deepEqual(afterRestart, beforeRestart);
  assert.deepEqual(await json(`${base}/api/wallet`), walletBeforeRestart);
  for (const expected of [reference, walletReference, roomReference]) assert.ok(afterRestart.orders.some(order => order.reference === expected));
  await staff.reload();
  for (const expected of [reference, walletReference, roomReference]) await staff.getByText(expected, { exact: true }).waitFor();
  await guest.reload();
  await guest.getByRole("heading", { name: "Thank you." }).waitFor();
  assert.deepEqual(guestErrors, []);
  passed("orders, transactions, wallet balance and audit survive a production process restart");
  await browser.close();
  browser = undefined;
  await stop(first);
  await stop(second);
  console.log(`All persistence checks passed. Isolated test database: ${directory}`);
} catch (error) {
  console.error(error);
  console.error(serverLog.slice(-6000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const server of servers) await stop(server);
}
