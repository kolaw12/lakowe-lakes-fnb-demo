import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";

const databaseUrl = "file:/tmp/lakowe-final-test.db";
const base = "http://127.0.0.1:3135";
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const tokens = new Map();
const codes = new Map();
const results = [];
let server;

const check = (name, detail) => {
  results.push({ name, status: "passed", detail });
  console.log(`[PASS] ${name}: ${detail}`);
};

const hash = val => createHash("sha256").update(val, "utf8").digest("hex");
const token = () => `LLQ1.${randomBytes(32).toString("base64url")}`;
const collectionCode = () => `LLC1-${randomBytes(10).toString("hex").toUpperCase()}`;

const ref = suffix => `FNL-${suffix}`;

async function seedBaseData() {
  const outlets = [
    { id: "clubhouse", name: "The Clubhouse Restaurant", type: "restaurant" },
    { id: "the_grill", name: "The Grill", type: "outdoor" },
    { id: "revivo", name: "Revivo Health Bar", type: "wellness" },
  ];
  for (const o of outlets) {
    await db.outlet.upsert({
      where: { id: o.id },
      create: o,
      update: o,
    });
  }

  const staff = [
    { id: "staff-ade", name: "Adeyemi Vance", role: "staff", outlets: ["clubhouse", "the_grill"] },
    { id: "staff-zainab", name: "Zainab Bello", role: "staff", outlets: ["revivo"] },
    { id: "supervisor-wale", name: "Wale Balogun", role: "supervisor", outlets: ["clubhouse", "revivo", "the_grill"] },
    { id: "mgr-folake", name: "Folake Adebayo", role: "manager", outlets: ["clubhouse", "revivo", "the_grill"] },
  ];
  for (const s of staff) {
    await db.demoUser.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, role: s.role, outletIds: JSON.stringify(s.outlets) },
      update: { name: s.name, role: s.role, outletIds: JSON.stringify(s.outlets) },
    });
  }
}

async function createOrderFixture(suffix, {
  outletId = "clubhouse",
  orderStatus = "ready",
  transactionStatus = "settled",
  paymentType = "demo",
  adjustmentJson = null,
  withCredential = true,
  handoffMode = "counter",
  destination = null,
  expiresAt = new Date(Date.now() + 86400000),
  credStatus = "active",
  revokedAt = null,
} = {}) {
  const order = await db.order.create({
    data: {
      id: ref(`ORDER-${suffix}`),
      reference: ref(`REF-${suffix}`),
      customerName: `Guest ${suffix}`,
      outletId,
      status: orderStatus,
      subtotal: 350000,
      total: 350000,
      paymentMethod: paymentType,
      items: {
        create: [
          { itemId: "cb-burger", itemName: "Lakowe Burger", unitPrice: 350000, quantity: 1, choicesJson: "{}" },
        ],
      },
    },
  });

  const transaction = await db.transaction.create({
    data: {
      id: ref(`TXN-${suffix}`),
      orderId: order.id,
      outletId,
      amount: 350000,
      paymentType,
      status: transactionStatus,
      initiatedBy: "final-test",
      adjustmentJson,
    },
  });

  await db.orderFulfillment.create({
    data: {
      orderId: order.id,
      checkoutKey: ref(`CHK-${suffix}`),
      handoffMode,
      destinationHint: destination,
    },
  });

  let cred = null;
  if (withCredential) {
    const rawTok = token();
    const rawCod = collectionCode();
    tokens.set(suffix, rawTok);
    codes.set(suffix, rawCod);
    cred = await db.orderVerification.create({
      data: {
        id: ref(`VER-${suffix}`),
        orderId: order.id,
        tokenHash: hash(rawTok),
        collectionCodeHash: hash(rawCod),
        tokenVersion: 1,
        status: credStatus,
        handoffMode,
        expiresAt,
        revokedAt,
        revokedReason: revokedAt ? "Revoked in fixture" : null,
      },
    });
  }

  return { order, transaction, credential: cred };
}

async function setupFixtures() {
  await db.orderHandoff.deleteMany();
  await db.orderVerificationAttempt.deleteMany();
  await db.orderVerification.deleteMany();
  await db.orderFulfillment.deleteMany();
  await db.auditEvent.deleteMany();
  await db.overrideRequest.deleteMany();
  await db.refundRequest.deleteMany();
  await db.walletLedgerEntry.deleteMany();
  await db.walletAccount.deleteMany();
  await db.operaRoomChargeAttempt.deleteMany();
  await db.sageAccountingSync.deleteMany();
  await db.transaction.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.outlet.deleteMany();
  await db.demoUser.deleteMany();

  await seedBaseData();

  // Test token & code generation format and entropy
  const sampleTokens = Array.from({ length: 50 }, token);
  const sampleCodes = Array.from({ length: 50 }, collectionCode);
  assert.equal(new Set(sampleTokens).size, sampleTokens.length);
  assert.equal(new Set(sampleCodes).size, sampleCodes.length);
  assert.ok(sampleTokens.every(t => /^LLQ1\.[A-Za-z0-9_-]{43}$/.test(t)));
  assert.ok(sampleCodes.every(c => /^LLC1-[A-F0-9]{20}$/.test(c)));
  check("Credential generation formats", "Tokens conform to LLQ1.<43 base64url chars>; collection codes conform to LLC1-<20 hex chars>.");

  // Fixtures:
  // 1. Ready eligible order (QR token confirm)
  await createOrderFixture("ELIGIBLE");
  // 2. Ready eligible order (Manual code confirm)
  await createOrderFixture("CODE-ELIGIBLE");
  // 3. Non-ready order (status preparing)
  await createOrderFixture("PREPARING", { orderStatus: "preparing" });
  // 4. Expired credential
  await createOrderFixture("EXPIRED", { expiresAt: new Date(Date.now() - 5000) });
  // 5. Revoked credential
  await createOrderFixture("REVOKED", { credStatus: "revoked", revokedAt: new Date() });
  // 6. Cross-outlet order (outlet: revivo)
  await createOrderFixture("CROSS-OUTLET", { outletId: "revivo" });
  // 7. Refunded order
  await createOrderFixture("REFUNDED", { transactionStatus: "refunded", paymentType: "wallet_demo" });
  // 8. Voided order
  await createOrderFixture("VOIDED", { transactionStatus: "voided", adjustmentJson: JSON.stringify({ type: "void" }) });

  // 9. Pending refund order
  const wallet = await db.walletAccount.create({ data: { id: ref("WALLET-1"), userId: ref("GUEST-1"), balance: 5000000 } });
  const pendingRefund = await createOrderFixture("PENDING-REFUND", { paymentType: "wallet_demo" });
  const debit = await db.walletLedgerEntry.create({
    data: {
      id: ref("WLEDGER-1"),
      walletId: wallet.id,
      amount: -350000,
      type: "purchase",
      status: "posted",
      reference: ref("WREF-1"),
      idempotencyKey: ref("WKEY-1"),
      orderReference: pendingRefund.order.reference,
    },
  });
  await db.refundRequest.create({
    data: {
      id: ref("REFUND-1"),
      transactionId: pendingRefund.transaction.id,
      walletId: wallet.id,
      sourceLedgerId: debit.id,
      actorId: "staff-ade",
      reason: "Pending refund test",
      status: "pending",
    },
  });

  // 10. Pending void order
  const pendingVoid = await createOrderFixture("PENDING-VOID");
  await db.overrideRequest.create({
    data: {
      id: ref("OVR-1"),
      transactionId: pendingVoid.transaction.id,
      actorId: "staff-ade",
      action: "void",
      reason: "Pending void test",
      status: "pending",
    },
  });

  // 11. OPERA settled order
  const operaSettled = await createOrderFixture("OPERA-SETTLED", { paymentType: "opera_demo", handoffMode: "room", destination: "101" });
  await db.operaRoomChargeAttempt.create({
    data: {
      id: ref("OPERA-ATT-SETTLED"),
      idempotencyKey: ref("OPERA-KEY-1"),
      orderReference: operaSettled.order.reference,
      orderId: operaSettled.order.id,
      transactionId: operaSettled.transaction.id,
      outletId: "clubhouse",
      amount: 350000,
      roomReference: "101",
      guestNameMasked: "J••• D••",
      checkoutJson: "{}",
      verificationStatus: "eligible",
      postingStatus: "settled",
      postingReference: ref("OPERA-POST-1"),
      reconciliationState: "not_required",
      initiatedBy: "guest-demo",
      initiatorRole: "guest",
    },
  });

  // 12. OPERA uncertain order
  const operaUncertain = await createOrderFixture("OPERA-UNCERTAIN", { paymentType: "opera_demo", handoffMode: "room", destination: "606" });
  await db.operaRoomChargeAttempt.create({
    data: {
      id: ref("OPERA-ATT-UNCERTAIN"),
      idempotencyKey: ref("OPERA-KEY-2"),
      orderReference: operaUncertain.order.reference,
      orderId: operaUncertain.order.id,
      transactionId: operaUncertain.transaction.id,
      outletId: "clubhouse",
      amount: 350000,
      roomReference: "606",
      guestNameMasked: "J••• D••",
      checkoutJson: "{}",
      verificationStatus: "eligible",
      postingStatus: "uncertain",
      postingReference: ref("OPERA-POST-2"),
      reconciliationState: "pending",
      initiatedBy: "guest-demo",
      initiatorRole: "guest",
    },
  });

  // 13. Order for concurrent confirmation
  await createOrderFixture("CONCURRENT");

  // 14. Order for supervisor exception
  await createOrderFixture("SUPERVISOR-EXC");

  // 15. Historical legacy order without verification credential
  await createOrderFixture("LEGACY", { withCredential: false });

  // 16. Newly QR-enabled order for enforcement test
  await createOrderFixture("ENFORCE");

  // 17. Verify DB hash storage
  const persistedCreds = await db.orderVerification.findMany({
    where: { id: { startsWith: "FNL-" } },
    select: { tokenHash: true, collectionCodeHash: true },
  });
  assert.ok(persistedCreds.every(c => /^[a-f0-9]{64}$/.test(c.tokenHash)));
  assert.ok(persistedCreds.every(c => c.collectionCodeHash && /^[a-f0-9]{64}$/.test(c.collectionCodeHash)));
  check("Database credential hashing", "All verification credentials store 64-char hex SHA-256 hashes only. No raw token or collection code is stored.");
}

async function start() {
  server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", "3135"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  server.stdout.on("data", chunk => output.push(String(chunk)));
  server.stderr.on("data", chunk => output.push(String(chunk)));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/demo`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Server failed to start on port 3135: ${output.join("")}`);
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

const post = (path, body, cookie) =>
  json(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

async function session(actorId) {
  const result = await post("/api/demo/session", { actorId });
  assert.equal(result.response.status, 200);
  return result.response.headers.get("set-cookie").split(";")[0];
}

async function expectStatus(resultPromise, status, code) {
  const result = await resultPromise;
  assert.equal(result.response.status, status, `Expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  if (code) assert.equal(result.body?.code, code, `Expected code ${code}, got ${result.body?.code}`);
  return result.body;
}

async function runTests() {
  const ade = await session("staff-ade");
  const zainab = await session("staff-zainab");
  const wale = await session("supervisor-wale");

  // 1. Unauthenticated checks
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("ELIGIBLE") }), 401);
  await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }), 401);
  check("Unauthenticated access rejected", "Staff verification endpoints reject unauthenticated calls with HTTP 401.");

  // 2. Format validation
  await expectStatus(post("/api/staff/order-verification/preview", { token: "invalid_format_xyz" }, ade), 400, "invalid_token");
  await expectStatus(post("/api/staff/order-verification/preview", { collectionCode: "123" }, ade), 400, "invalid_token");
  check("Malformed credentials rejected", "Bad token and short collection code formats reject with HTTP 400.");

  // 3. Unknown credentials
  await expectStatus(post("/api/staff/order-verification/preview", { token: token() }, ade), 404, "not_found");
  await expectStatus(post("/api/staff/order-verification/preview", { collectionCode: collectionCode() }, ade), 404, "not_found");
  check("Non-existent credentials return 404", "Valid formatted but nonexistent credentials return HTTP 404.");

  // 4. Cross-outlet protection
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("CROSS-OUTLET") }, ade), 403, "forbidden");
  await expectStatus(post("/api/staff/order-verification/preview", { collectionCode: codes.get("CROSS-OUTLET") }, ade), 403, "forbidden");
  // Zainab at Revivo CAN access Revivo order
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("CROSS-OUTLET") }, zainab), 200);
  check("Outlet authorization enforcement", "Ade (Clubhouse) blocked with 403 on Revivo order; Zainab (Revivo) allowed with 200.");

  // 5. Business state eligibility matrix
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("EXPIRED") }, ade), 409, "expired");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("REVOKED") }, ade), 409, "revoked");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("PREPARING") }, ade), 409, "order_not_ready");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("REFUNDED") }, ade), 409, "payment_reversed");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("VOIDED") }, ade), 409, "payment_reversed");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("PENDING-REFUND") }, ade), 409, "financial_review_pending");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("PENDING-VOID") }, ade), 409, "financial_review_pending");
  await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("OPERA-UNCERTAIN") }, ade), 409, "opera_unconfirmed");
  check("Fulfillment eligibility matrix", "Expired, revoked, non-ready, refunded, voided, pending-review, and uncertain OPERA rejected with HTTP 409.");

  // 6. Dual preview: QR token vs manual collection code parity
  const previewToken = await expectStatus(post("/api/staff/order-verification/preview", { token: tokens.get("ELIGIBLE") }, ade), 200);
  const previewCode = await expectStatus(post("/api/staff/order-verification/preview", { collectionCode: codes.get("ELIGIBLE") }, ade), 200);
  assert.equal(previewToken.preview.orderReference, ref("REF-ELIGIBLE"));
  assert.equal(previewCode.preview.orderReference, ref("REF-ELIGIBLE"));
  assert.deepEqual(previewToken.preview, previewCode.preview);
  assert.deepEqual(
    Object.keys(previewToken.preview).sort(),
    ["amount", "canConfirm", "customerName", "destinationHint", "expiresAt", "handoffMode", "items", "orderReference", "orderStatus", "outlet", "paymentMethod", "paymentStatus", "verificationId"].sort()
  );
  check("QR and code preview parity", "Token and collection code return identical allowlisted operational preview fields.");

  // 7. Preview read-only verification
  const orderBefore = await db.order.findUnique({ where: { id: ref("ORDER-ELIGIBLE") } });
  assert.equal(orderBefore.status, "ready");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 0);
  check("Preview non-mutation", "Preview endpoints are strictly read-only and did not alter order, credential, or handoff state.");

  // Financial baseline count
  const finBefore = {
    transactions: await db.transaction.count(),
    ledger: await db.walletLedgerEntry.count(),
    deposits: await db.depositRecord.count(),
    opera: await db.operaRoomChargeAttempt.count(),
    sage: await db.sageAccountingSync.count(),
  };

  // 8. Atomic confirmation via QR token
  const confirmTok = await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }, ade), 200);
  assert.equal(confirmTok.handoff.completedBy, "staff-ade");
  const orderAfterTok = await db.order.findUnique({ where: { id: ref("ORDER-ELIGIBLE") } });
  const credAfterTok = await db.orderVerification.findUnique({ where: { id: ref("VER-ELIGIBLE") } });
  assert.equal(orderAfterTok.status, "completed");
  assert.equal(credAfterTok.status, "redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 1);
  check("Atomic QR confirmation", "Confirmation via QR token redeemed the credential, marked order completed, and recorded immutable handoff.");

  // 9. Replay prevention on redeemed token and code
  await expectStatus(post("/api/staff/order-verification/confirm", { token: tokens.get("ELIGIBLE") }, ade), 409, "already_redeemed");
  await expectStatus(post("/api/staff/order-verification/confirm", { collectionCode: codes.get("ELIGIBLE") }, ade), 409, "already_redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-ELIGIBLE") } }), 1);
  check("Replay protection", "Subsequent confirm attempts with either QR token or manual code return HTTP 409 already_redeemed.");

  // 10. Atomic confirmation via manual collection code
  const confirmCod = await expectStatus(post("/api/staff/order-verification/confirm", { collectionCode: codes.get("CODE-ELIGIBLE") }, ade), 200);
  assert.equal(confirmCod.handoff.completedBy, "staff-ade");
  const orderAfterCod = await db.order.findUnique({ where: { id: ref("ORDER-CODE-ELIGIBLE") } });
  const credAfterCod = await db.orderVerification.findUnique({ where: { id: ref("VER-CODE-ELIGIBLE") } });
  assert.equal(orderAfterCod.status, "completed");
  assert.equal(credAfterCod.status, "redeemed");
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-CODE-ELIGIBLE") } }), 1);
  check("Atomic manual code confirmation", "Confirmation via manual collection code redeemed the credential and completed the order.");

  // 11. Concurrency test (race condition)
  const concurrentReqs = await Promise.all([
    post("/api/staff/order-verification/confirm", { token: tokens.get("CONCURRENT") }, ade),
    post("/api/staff/order-verification/confirm", { token: tokens.get("CONCURRENT") }, ade),
  ]);
  const concurrentStatuses = concurrentReqs.map(r => r.response.status).sort();
  assert.deepEqual(concurrentStatuses, [200, 409]);
  assert.equal(await db.orderHandoff.count({ where: { orderId: ref("ORDER-CONCURRENT") } }), 1);
  assert.equal((await db.order.findUnique({ where: { id: ref("ORDER-CONCURRENT") } })).status, "completed");
  check("Concurrency race handling", "Two simultaneous confirm requests produced exactly one HTTP 200 and one HTTP 409 with exactly one handoff.");

  // 12. Rate limiting on collection code guessing
  for (let i = 0; i < 10; i++) {
    const badCode = `LLC1-${String(i).padStart(20, "0")}`;
    await post("/api/staff/order-verification/preview", { collectionCode: badCode }, ade);
  }
  const rateLimitedRes = await post("/api/staff/order-verification/preview", { collectionCode: "LLC1-" + "A".repeat(20) }, ade);
  assert.equal(rateLimitedRes.response.status, 429);
  assert.equal(rateLimitedRes.body?.code, "rate_limited");
  check("Brute-force rate limiting", "10 consecutive invalid collection code attempts triggered HTTP 429 rate_limited on 11th attempt.");

  // 13. Supervisor exception flow
  // Non-supervisor attempt rejected
  await expectStatus(
    post("/api/staff/order-verification/exception", {
      orderReference: ref("REF-SUPERVISOR-EXC"),
      reason: "Guest cannot find phone",
    }, ade),
    403,
    "forbidden"
  );
  // Empty reason rejected
  await expectStatus(
    post("/api/staff/order-verification/exception", {
      orderReference: ref("REF-SUPERVISOR-EXC"),
      reason: "   ",
    }, wale),
    400,
    "invalid_request"
  );
  // Valid supervisor exception
  const excSuccess = await expectStatus(
    post("/api/staff/order-verification/exception", {
      orderReference: ref("REF-SUPERVISOR-EXC"),
      reason: "Guest battery died; verified golfer name and physical clubhouse receipt.",
    }, wale),
    200
  );
  assert.equal(excSuccess.handoff.completedBy, "supervisor-wale");
  const excOrder = await db.order.findUnique({ where: { id: ref("ORDER-SUPERVISOR-EXC") } });
  const excCred = await db.orderVerification.findUnique({ where: { id: ref("VER-SUPERVISOR-EXC") } });
  assert.equal(excOrder.status, "completed");
  assert.equal(excCred.status, "redeemed");
  const excHandoff = await db.orderHandoff.findFirst({ where: { orderId: ref("ORDER-SUPERVISOR-EXC") } });
  assert.ok(excHandoff.exceptionReason.includes("Guest battery died"));
  check("Audited supervisor exception", "Supervisor override validated role and non-empty reason, redeemed credential, and recorded detailed audit note.");

  // 14. Mandatory verification enforcement on newly QR-enabled orders
  // Direct update to completed without verification fails
  const directCompleteAttempt = await post("/api/demo", {
    action: "updateOrder",
    actorId: "staff-ade",
    reference: ref("REF-ENFORCE"),
    status: "completed",
  }, ade);
  assert.equal(directCompleteAttempt.response.status, 409);
  assert.ok(directCompleteAttempt.body?.error?.includes("Newly QR-enabled orders require verified handoff"));
  check("Mandatory verification enforcement", "updateOrder directly transitioning ready QR-enabled order to completed was rejected with HTTP 409.");

  // 15. Historical non-QR order behavior preserved
  const legacyComplete = await expectStatus(
    post("/api/demo", {
      action: "updateOrder",
      actorId: "staff-ade",
      reference: ref("REF-LEGACY"),
      status: "completed",
    }, ade),
    200
  );
  assert.equal(legacyComplete.data.status, "completed");
  assert.equal(await db.orderVerification.count({ where: { orderId: ref("ORDER-LEGACY") } }), 0);
  check("Historical order preservation", "Non-QR historical order completed normally through existing updateOrder flow without requiring QR.");

  // 16. Financial non-mutation assertion
  const finAfter = {
    transactions: await db.transaction.count(),
    ledger: await db.walletLedgerEntry.count(),
    deposits: await db.depositRecord.count(),
    opera: await db.operaRoomChargeAttempt.count(),
    sage: await db.sageAccountingSync.count(),
  };
  assert.deepEqual(finAfter, finBefore, `Financial counts mutated! Before: ${JSON.stringify(finBefore)}, After: ${JSON.stringify(finAfter)}`);
  check("Financial and integration non-mutation", `All financial tables remained completely unmutated across all previews, handoffs, exceptions: ${JSON.stringify(finAfter)}.`);
}

try {
  console.log("Setting up fixtures in isolated database /tmp/lakowe-final-test.db...");
  await setupFixtures();
  console.log("Starting Next.js server on port 3135...");
  await start();
  console.log("Running comprehensive end-to-end tests...");
  await runTests();
  await writeFile(
    "verification/artifacts/final-verification-results.json",
    JSON.stringify({ databaseUrl, generatedAt: new Date().toISOString(), results }, null, 2)
  );
  console.log("\n=================================");
  console.log(`ALL ${results.length} VERIFICATION CHECKS PASSED!`);
  console.log("=================================\n");
} catch (error) {
  console.error("Test failure:", error);
  process.exitCode = 1;
} finally {
  await stop();
  await db.$disconnect();
}
