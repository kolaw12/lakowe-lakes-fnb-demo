import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";

const databaseUrl = "file:/tmp/lakowe-phase7b.db";
const base = "http://127.0.0.1:3130";
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const tokens = new Map();
const results = [];
let server;

const check = (name, detail) => results.push({ name, status: "passed", detail });
const hash = token => createHash("sha256").update(token, "utf8").digest("hex");
const token = () => `LLQ1.${randomBytes(32).toString("base64url")}`;
const ref = suffix => `P7B-${suffix}`;

async function order(suffix, { outletId = "clubhouse", orderStatus = "ready", transactionStatus = "settled", paymentType = "demo", adjustmentJson = null } = {}) {
  const order = await db.order.create({ data: { id: ref(`ORDER-${suffix}`), reference: ref(`REF-${suffix}`), customerName: "Phase 7B", outletId, status: orderStatus, subtotal: 350000, total: 350000, paymentMethod: paymentType } });
  const transaction = await db.transaction.create({ data: { id: ref(`TXN-${suffix}`), orderId: order.id, outletId, amount: 350000, paymentType, status: transactionStatus, initiatedBy: "phase7b", adjustmentJson } });
  return { order, transaction };
}

async function credential(suffix, orderId, { status = "active", handoffMode = "counter", expiresAt = new Date(Date.now() + 86400000), revokedAt = null } = {}) {
  const raw = token();
  tokens.set(suffix, raw);
  const row = await db.orderVerification.create({ data: { id: ref(`VER-${suffix}`), orderId, tokenHash: hash(raw), tokenVersion: 1, status, handoffMode, expiresAt, revokedAt, revokedReason: revokedAt ? "Phase 7B fixture" : null } });
  return { raw, row };
}

async function fixtures() {
  const generated = Array.from({ length: 100 }, token);
  assert.equal(new Set(generated).size, generated.length);
  assert.ok(generated.every(value => /^LLQ1\.[A-Za-z0-9_-]{43}$/.test(value)));
  check("Secure token generation", "100 unique LLQ1 tokens, each carrying 32 random bytes.");

  const eligible = await order("ELIGIBLE"); await credential("ELIGIBLE", eligible.order.id);
  const nonReady = await order("NONREADY", { orderStatus: "preparing" }); await credential("NONREADY", nonReady.order.id);
  const expired = await order("EXPIRED"); await credential("EXPIRED", expired.order.id, { expiresAt: new Date(Date.now() - 1000) });
  const revoked = await order("REVOKED"); await credential("REVOKED", revoked.order.id, { status: "revoked", revokedAt: new Date() });
  const wrongOutlet = await order("WRONGOUTLET", { outletId: "revivo" }); await credential("WRONGOUTLET", wrongOutlet.order.id);
  const refunded = await order("REFUNDED", { transactionStatus: "refunded", paymentType: "wallet_demo" }); await credential("REFUNDED", refunded.order.id);
  const voided = await order("VOIDED", { transactionStatus: "voided", adjustmentJson: JSON.stringify({ type: "void", reference: ref("VOID") }) }); await credential("VOIDED", voided.order.id);

  const wallet = await db.walletAccount.create({ data: { id: ref("WALLET"), userId: ref("GOLFER"), balance: 1000000 } });
  const pendingRefund = await order("PENDING-REFUND", { paymentType: "wallet_demo" });
  const debit = await db.walletLedgerEntry.create({ data: { id: ref("DEBIT"), walletId: wallet.id, amount: -350000, type: "purchase", status: "posted", reference: ref("DEBIT-REF"), idempotencyKey: ref("DEBIT-KEY"), orderReference: pendingRefund.order.reference } });
  await db.refundRequest.create({ data: { id: ref("REFUND"), transactionId: pendingRefund.transaction.id, walletId: wallet.id, sourceLedgerId: debit.id, actorId: "staff-ade", reason: "Phase 7B pending refund", status: "pending" } });
  await credential("PENDING-REFUND", pendingRefund.order.id);

  const pendingVoid = await order("PENDING-VOID");
  await db.overrideRequest.create({ data: { id: ref("OVERRIDE"), transactionId: pendingVoid.transaction.id, actorId: "staff-ade", action: "void", reason: "Phase 7B pending void", status: "pending" } });
  await credential("PENDING-VOID", pendingVoid.order.id);

  const discounted = await order("DISCOUNTED", { transactionStatus: "discounted", adjustmentJson: JSON.stringify({ type: "discount", amount: 50000, reference: ref("DISC") }) }); await credential("DISCOUNTED", discounted.order.id, { handoffMode: "table" });

  const operaSettled = await order("OPERA-SETTLED", { paymentType: "opera_demo" });
  await db.operaRoomChargeAttempt.create({ data: { id: ref("OPERA-SETTLED"), idempotencyKey: ref("OPERA-SETTLED-KEY"), orderReference: operaSettled.order.reference, orderId: operaSettled.order.id, transactionId: operaSettled.transaction.id, outletId: "clubhouse", amount: 350000, roomReference: "101", guestNameMasked: "P•••B", checkoutJson: "{}", verificationStatus: "eligible", postingStatus: "settled", postingReference: ref("OPERA-POST"), reconciliationState: "not_required", initiatedBy: "guest-demo", initiatorRole: "guest" } });
  await credential("OPERA-SETTLED", operaSettled.order.id, { handoffMode: "room" });

  const operaUncertain = await order("OPERA-UNCERTAIN", { paymentType: "opera_demo" });
  await db.operaRoomChargeAttempt.create({ data: { id: ref("OPERA-UNCERTAIN"), idempotencyKey: ref("OPERA-UNCERTAIN-KEY"), orderReference: operaUncertain.order.reference, orderId: operaUncertain.order.id, transactionId: operaUncertain.transaction.id, outletId: "clubhouse", amount: 350000, roomReference: "606", guestNameMasked: "P•••B", checkoutJson: "{}", verificationStatus: "eligible", postingStatus: "uncertain", postingReference: ref("OPERA-PENDING"), reconciliationState: "pending", initiatedBy: "guest-demo", initiatorRole: "guest" } });
  await credential("OPERA-UNCERTAIN", operaUncertain.order.id, { handoffMode: "room" });

  const concurrent = await order("CONCURRENT"); await credential("CONCURRENT", concurrent.order.id, { handoffMode: "golf_course" });
  await order("LEGACY");

  const persisted = await db.orderVerification.findMany({ where: { id: { startsWith: "P7B-" } }, select: { tokenHash: true } });
  assert.ok(persisted.every(row => !Array.from(tokens.values()).includes(row.tokenHash)));
  assert.ok(persisted.every(row => /^[a-f0-9]{64}$/.test(row.tokenHash)));
  check("Hashed token persistence", `${persisted.length} credentials store SHA-256 hashes only; no raw token is persisted.`);
  await assert.rejects(() => db.orderVerification.create({ data: { id: ref("VER-DUPLICATE"), orderId: eligible.order.id, tokenHash: hash(token()), tokenVersion: 1, status: "active", handoffMode: "counter", expiresAt: new Date(Date.now() + 86400000) } }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
  check("One credential per order", "Unique orderId constraint rejected a second credential.");
}

async function start() {
  server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", "3130"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl }, stdio: ["ignore", "pipe", "pipe"] });
  const output = [];
  server.stdout.on("data", chunk => output.push(String(chunk)));
  server.stderr.on("data", chunk => output.push(String(chunk)));
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/demo`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server failed to start: ${output.join("")}`);
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise(resolve => server.once("exit", resolve));
}

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  return { response, body: await response.json().catch(() => null) };
}
const post = (path, body, cookie) => json(path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
async function session(actorId) {
  const result = await post("/api/demo/session", { actorId });
  assert.equal(result.response.status, 200);
  return result.response.headers.get("set-cookie").split(";")[0];
}
async function expectStatus(resultPromise, status, code) {
  const result = await resultPromise;
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.body?.code, code);
  return result.body;
}

async function httpTests() {
  const ade = await session("staff-ade");
  const zainab = await session("staff-zainab");
  const beforePreview = { order: await db.order.findUnique({ where: { id: ref("ORDER-ELIGIBLE") } }), audits: await db.auditEvent.count(), handoffs: await db.orderHandoff.count() };

  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("ELIGIBLE") }), 401);
  await expectStatus(post("/api/staff/order-verification/preview", { token: "bad" }, ade), 400, "invalid_token");
  await expectStatus(post("/api/staff/order-verification/preview", { token: token() }, ade), 404, "not_found");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("WRONGOUTLET") }, ade), 403, "forbidden");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("EXPIRED") }, ade), 409, "expired");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("REVOKED") }, ade), 409, "revoked");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("NONREADY") }, ade), 409, "order_not_ready");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("REFUNDED") }, ade), 409, "payment_reversed");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("VOIDED") }, ade), 409, "payment_reversed");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("PENDING-REFUND") }, ade), 409, "financial_review_pending");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("PENDING-VOID") }, ade), 409, "financial_review_pending");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("OPERA-UNCERTAIN") }, ade), 409, "opera_unconfirmed");
  const discounted = await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("DISCOUNTED") }, ade), 200);
  assert.equal(discounted.preview.paymentStatus, "discounted");
  const opera = await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("OPERA-SETTLED") }, ade), 200);
  assert.equal(opera.preview.paymentMethod, "opera_demo");
  const preview = await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("ELIGIBLE") }, ade), 200);
  assert.deepEqual(Object.keys(preview.preview).sort(), ["amount", "canConfirm", "expiresAt", "handoffMode", "items", "orderReference", "orderStatus", "outlet", "paymentMethod", "paymentStatus", "verificationId"].sort());
  assert.equal((await db.order.findUnique({ where: { id: ref("ORDER-ELIGIBLE") } })).status, beforePreview.order.status);
  assert.equal(await db.auditEvent.count(), beforePreview.audits);
  assert.equal(await db.orderHandoff.count(), beforePreview.handoffs);
  check("Authorization and eligibility matrix", "Missing session, invalid/unknown token, cross-outlet, expired, revoked, non-ready, refunded, voided, pending refund/void and uncertain OPERA were rejected; valid discount and settled OPERA passed.");
  check("Preview is read-only", "Eligible preview returned allowlisted operational fields and changed no order, audit or handoff state.");

  const financialBefore = { transactions: await db.transaction.count(), ledger: await db.walletLedgerEntry.count(), deposits: await db.depositRecord.count(), opera: await db.operaRoomChargeAttempt.count(), sage: await db.sageAccountingSync.count() };
  const confirmed = await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }, ade), 200);
  assert.equal(confirmed.handoff.completedBy, "staff-ade");
  assert.equal((await db.order.findUnique({ where: { id: ref("ORDER-ELIGIBLE") } })).status, "completed");
  assert.equal((await db.orderVerification.findUnique({ where: { id: ref("VER-ELIGIBLE") } })).status, "redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 1);
  assert.equal(await db.auditEvent.count({ where: { requestId: ref("VER-ELIGIBLE"), action: "order.status_changed", actorId: "staff-ade" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { requestId: ref("VER-ELIGIBLE"), action: "order.handoff_completed", actorId: "staff-ade" } }), 1);
  await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }, ade), 409, "already_redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 1);
  check("Atomic confirmation and replay", "One confirm redeemed the credential, completed the Ready order, created one immutable handoff and two attributed audits; replay returned HTTP 409.");

  const concurrent = await Promise.all([post("/api/staff/order-verification/confirm", { token: tokens.get("CONCURRENT") }, ade), post("/api/staff/order-verification/confirm", { token: tokens.get("CONCURRENT") }, ade)]);
  const statuses = concurrent.map(item => item.response.status).sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-CONCURRENT") } }), 1);
  assert.equal((await db.order.findUnique({ where: { id: ref("ORDER-CONCURRENT") } })).status, "completed");
  check("Concurrent confirmation", "Two concurrent requests produced one HTTP 200 and one business HTTP 409, with one handoff and no partial state.");

  const financialAfter = { transactions: await db.transaction.count(), ledger: await db.walletLedgerEntry.count(), deposits: await db.depositRecord.count(), opera: await db.operaRoomChargeAttempt.count(), sage: await db.sageAccountingSync.count() };
  assert.deepEqual(financialAfter, financialBefore);
  check("Financial and integration non-mutation", `Counts unchanged: ${JSON.stringify(financialAfter)}.`);

  const legacy = await expectStatus(post("/api/demo", { action: "updateOrder", actorId: "staff-ade", reference: ref("REF-LEGACY"), status: "completed" }, ade), 200);
  assert.equal(legacy.data.status, "completed");
  assert.equal(await db.orderVerification.count({ where: { orderId: ref("ORDER-LEGACY") } }), 0);
  check("Legacy completion compatibility", "A Ready historical/non-QR order completed through the existing protected service without a QR credential.");

  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("WRONGOUTLET") }, zainab), 200);
}

async function restartTest() {
  await stop();
  await start();
  const ade = await session("staff-ade");
  await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }, ade), 409, "already_redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 1);
  check("Restart persistence", "Redeemed state and the immutable handoff survived production-server restart.");
}

try {
  await fixtures();
  await start();
  await httpTests();
  await restartTest();
  await writeFile("verification/artifacts/phase7b-results.json", JSON.stringify({ databaseUrl, generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ databaseUrl, results }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
  await db.$disconnect();
}
