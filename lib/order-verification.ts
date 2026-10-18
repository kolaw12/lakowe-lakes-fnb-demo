import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { managementEligibleAmount } from "@/lib/management-reporting";
import { prisma } from "@/lib/prisma";
import { credentialSecrets } from "@/lib/order-fulfillment";

export const ORDER_VERIFICATION_VERSION = 1;
export const ORDER_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
import { HANDOFF_MODES, type HandoffMode } from "@/lib/fnb";
export { HANDOFF_MODES, type HandoffMode };
export type VerificationActor = { id: string; role: string; outlets: string[] };

type VerificationErrorStatus = 400 | 403 | 404 | 409 | 429 | 503;
export class OrderVerificationError extends Error {
  constructor(message: string, readonly status: VerificationErrorStatus, readonly code: string) { super(message); }
}

const auditId = () => `AUD-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
const handoffId = () => `HOF-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
const hash = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");

const tokenPattern = /^LLQ1\.[A-Za-z0-9_-]{43}$/;
const collectionCodePattern = /^LLC1-[A-F0-9]{20}$/i;

function validMode(value: string): value is HandoffMode { return HANDOFF_MODES.includes(value as HandoffMode); }

export type ParsedCredential = 
  | { type: "token"; raw: string; hash: string }
  | { type: "collectionCode"; raw: string; hash: string };

export function parseCredential(input: string): ParsedCredential {
  const trimmed = input.trim();
  if (tokenPattern.test(trimmed)) {
    return { type: "token", raw: trimmed, hash: hash(trimmed) };
  }
  const upper = trimmed.toUpperCase();
  if (collectionCodePattern.test(upper)) {
    return { type: "collectionCode", raw: upper, hash: hash(upper) };
  }
  throw new OrderVerificationError("The verification code is invalid.", 400, "invalid_token");
}

async function checkRateLimit(actorId: string) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const failedAttempts = await prisma.orderVerificationAttempt.count({
    where: {
      actorId,
      success: false,
      createdAt: { gte: fiveMinutesAgo },
    },
  });
  if (failedAttempts >= 10) {
    throw new OrderVerificationError("Too many failed verification attempts. Please wait five minutes before trying again.", 429, "rate_limited");
  }
}

async function logAttempt(actorId: string, credentialHash: string, action: string, success: boolean) {
  try {
    await prisma.orderVerificationAttempt.create({
      data: {
        actorId,
        credentialHash,
        action,
        success,
      },
    });
  } catch {
    // Non-blocking telemetry
  }
}

const verificationInclude = {
  handoff: true,
  order: {
    include: {
      outlet: { select: { id: true, name: true } },
      items: { select: { itemName: true, quantity: true, choicesJson: true } },
      transaction: { include: { refundRequest: true, overrides: true, operaRoomCharge: true } },
      fulfillment: true,
    },
  },
} satisfies Prisma.OrderVerificationInclude;

type VerificationRecord = Prisma.OrderVerificationGetPayload<{ include: typeof verificationInclude }>;
type VerificationDb = Prisma.TransactionClient | typeof prisma;

function assertActor(actor: VerificationActor, outletId: string) {
  if (!actor || !["staff", "supervisor"].includes(actor.role) || !actor.outlets.includes(outletId)) {
    throw new OrderVerificationError("This order cannot be verified by the current staff session.", 403, "forbidden");
  }
}

function assertEligible(record: VerificationRecord, actor: VerificationActor, now: Date) {
  assertActor(actor, record.order.outletId);
  if (record.status === "redeemed" || record.redeemedAt || record.handoff) {
    throw new OrderVerificationError("This order handoff has already been completed.", 409, "already_redeemed");
  }
  if (record.status === "revoked" || record.revokedAt) {
    throw new OrderVerificationError("This verification credential has been revoked.", 409, "revoked");
  }
  if (record.status !== "active") {
    throw new OrderVerificationError("This verification credential is not active.", 409, "inactive");
  }
  if (record.expiresAt.getTime() <= now.getTime()) {
    throw new OrderVerificationError("This verification credential has expired.", 409, "expired");
  }
  if (record.order.status !== "ready") {
    throw new OrderVerificationError("The order must be Ready before handoff can be confirmed.", 409, "order_not_ready");
  }
  const transaction = record.order.transaction;
  if (!transaction) throw new OrderVerificationError("The order has no confirmed payment transaction.", 409, "payment_unconfirmed");
  if (["refunded", "voided"].includes(transaction.status)) throw new OrderVerificationError("This order is no longer eligible for handoff.", 409, "payment_reversed");
  if (managementEligibleAmount(transaction) === null) throw new OrderVerificationError("The order payment is not eligible for handoff.", 409, "payment_ineligible");
  if (transaction.refundRequest?.status === "pending" || transaction.overrides.some(item => item.status === "pending" && item.action === "void")) {
    throw new OrderVerificationError("A pending financial-control request must be resolved before handoff.", 409, "financial_review_pending");
  }
  if (transaction.paymentType === "opera_demo" && (!transaction.operaRoomCharge || transaction.operaRoomCharge.postingStatus !== "settled" || transaction.operaRoomCharge.reconciliationState === "pending")) {
    throw new OrderVerificationError("The simulated room charge is not confirmed for handoff.", 409, "opera_unconfirmed");
  }
  return transaction;
}

async function recordForCredential(db: VerificationDb, credentialInput: string, actorId: string, action: string) {
  await checkRateLimit(actorId);
  let parsed: ParsedCredential;
  try {
    parsed = parseCredential(credentialInput);
  } catch (error) {
    await logAttempt(actorId, hash(credentialInput.slice(0, 50)), action, false);
    throw error;
  }

  const record = parsed.type === "token"
    ? await db.orderVerification.findUnique({ where: { tokenHash: parsed.hash }, include: verificationInclude })
    : await db.orderVerification.findUnique({ where: { collectionCodeHash: parsed.hash }, include: verificationInclude });

  if (!record) {
    await logAttempt(actorId, parsed.hash, action, false);
    throw new OrderVerificationError("The verification code is invalid.", 404, "not_found");
  }
  if (record.tokenVersion !== ORDER_VERIFICATION_VERSION) {
    await logAttempt(actorId, parsed.hash, action, false);
    throw new OrderVerificationError("The verification code version is not supported.", 400, "unsupported_version");
  }

  await logAttempt(actorId, parsed.hash, action, true);
  return { record, parsed };
}

function previewDto(record: VerificationRecord, transaction: NonNullable<VerificationRecord["order"]["transaction"]>) {
  return {
    verificationId: record.id,
    orderReference: record.order.reference,
    customerName: record.order.customerName,
    outlet: record.order.outlet,
    handoffMode: record.handoffMode as HandoffMode,
    destinationHint: record.order.fulfillment?.destinationHint || null,
    orderStatus: record.order.status,
    paymentStatus: transaction.status,
    paymentMethod: transaction.paymentType,
    amount: transaction.amount,
    items: record.order.items.map(item => ({ itemName: item.itemName, quantity: item.quantity })),
    expiresAt: record.expiresAt.toISOString(),
    canConfirm: true,
  };
}

export async function issueOrderVerification(input: { orderId: string; handoffMode: HandoffMode; expiresAt?: Date }) {
  if (!input.orderId || !validMode(input.handoffMode)) throw new OrderVerificationError("Select a valid order and handoff mode.", 400, "invalid_issue_request");
  const secrets = credentialSecrets();
  const token = secrets.token;
  const expiresAt = input.expiresAt || new Date(Date.now() + ORDER_VERIFICATION_TTL_MS);
  if (expiresAt.getTime() <= Date.now()) throw new OrderVerificationError("Verification expiration must be in the future.", 400, "invalid_expiration");
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { transaction: { include: { operaRoomCharge: true } }, verification: true } });
  if (!order) throw new OrderVerificationError("The order was not found.", 404, "order_not_found");
  if (order.verification) throw new OrderVerificationError("This order already has a verification credential.", 409, "credential_exists");
  if (!order.transaction || managementEligibleAmount(order.transaction) === null) throw new OrderVerificationError("Only confirmed eligible orders can receive a verification credential.", 409, "payment_ineligible");
  if (order.transaction.paymentType === "opera_demo" && order.transaction.operaRoomCharge?.postingStatus !== "settled") throw new OrderVerificationError("The simulated room charge is not confirmed.", 409, "opera_unconfirmed");
  const verification = await prisma.orderVerification.create({
    data: {
      orderId: order.id,
      tokenHash: hash(token),
      collectionCodeHash: hash(secrets.collectionCode),
      tokenVersion: ORDER_VERIFICATION_VERSION,
      status: "active",
      handoffMode: input.handoffMode,
      expiresAt,
    },
  });
  return {
    token,
    collectionCode: secrets.collectionCode,
    verification: {
      id: verification.id,
      orderId: verification.orderId,
      handoffMode: verification.handoffMode as HandoffMode,
      status: verification.status,
      expiresAt: verification.expiresAt.toISOString(),
    },
  };
}

export async function reissueOrderVerification(input: { orderId: string; actor: VerificationActor; handoffMode: HandoffMode; expiresAt?: Date; reason: string }) {
  if (!input.reason.trim() || input.reason.trim().length > 500 || !validMode(input.handoffMode)) throw new OrderVerificationError("A valid reissue reason and handoff mode are required.", 400, "invalid_reissue_request");
  const secrets = credentialSecrets();
  const token = secrets.token;
  const expiresAt = input.expiresAt || new Date(Date.now() + ORDER_VERIFICATION_TTL_MS);
  const verification = await prisma.orderVerification.findUnique({ where: { orderId: input.orderId }, include: { handoff: true, order: { select: { outletId: true } } } });
  if (!verification || verification.handoff || verification.status === "redeemed") throw new OrderVerificationError("This credential cannot be reissued.", 409, "reissue_not_allowed");
  if (input.actor.role !== "supervisor" || !input.actor.outlets.includes(verification.order.outletId)) throw new OrderVerificationError("Supervisor access for this outlet is required to reissue a credential.", 403, "forbidden");
  const updated = await prisma.orderVerification.update({ where: { id: verification.id }, data: { tokenHash: hash(token), collectionCodeHash: hash(secrets.collectionCode), tokenVersion: ORDER_VERIFICATION_VERSION, handoffMode: input.handoffMode, status: "active", expiresAt, revokedAt: null, revokedBy: null, revokedReason: null, redeemedAt: null, redeemedBy: null } });
  await prisma.auditEvent.create({ data: { id: auditId(), actorId: input.actor.id, actorRole: input.actor.role, action: "order_verification.reissued", entityType: "orderVerification", entityId: updated.id, requestId: updated.id, afterJson: JSON.stringify({ orderId: updated.orderId, handoffMode: updated.handoffMode, expiresAt: updated.expiresAt, reason: input.reason.trim(), tokenVersion: updated.tokenVersion }) } });
  return { token, collectionCode: secrets.collectionCode, verificationId: updated.id, expiresAt: updated.expiresAt.toISOString() };
}

export async function revokeOrderVerification(input: { orderId: string; actor: VerificationActor; reason: string }) {
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new OrderVerificationError("A revocation reason is required.", 400, "invalid_revocation_request");
  return prisma.$transaction(async tx => {
    const verification = await tx.orderVerification.findUnique({ where: { orderId: input.orderId }, include: { order: { select: { outletId: true } } } });
    if (!verification) throw new OrderVerificationError("The verification credential was not found.", 404, "not_found");
    if (input.actor.role !== "supervisor" || !input.actor.outlets.includes(verification.order.outletId)) throw new OrderVerificationError("Supervisor access for this outlet is required to revoke a credential.", 403, "forbidden");
    if (verification.status !== "active") throw new OrderVerificationError("Only an active credential can be revoked.", 409, "not_active");
    const updated = await tx.orderVerification.update({ where: { id: verification.id }, data: { status: "revoked", revokedAt: new Date(), revokedBy: input.actor.id, revokedReason: input.reason.trim() } });
    await tx.auditEvent.create({ data: { id: auditId(), actorId: input.actor.id, actorRole: input.actor.role, action: "order_verification.revoked", entityType: "orderVerification", entityId: updated.id, requestId: updated.id, beforeJson: JSON.stringify({ status: "active" }), afterJson: JSON.stringify({ status: "revoked", reason: input.reason.trim() }) } });
    return updated;
  });
}

export async function previewOrderVerification(actor: VerificationActor, credentialInput: string) {
  const { record } = await recordForCredential(prisma, credentialInput, actor.id, "preview");
  const transaction = assertEligible(record, actor, new Date());
  return previewDto(record, transaction);
}

async function confirmOnce(actor: VerificationActor, credentialInput: string) {
  const parsed = parseCredential(credentialInput);
  return prisma.$transaction(async tx => {
    const record = parsed.type === "token"
      ? await tx.orderVerification.findUnique({ where: { tokenHash: parsed.hash }, include: verificationInclude })
      : await tx.orderVerification.findUnique({ where: { collectionCodeHash: parsed.hash }, include: verificationInclude });

    if (!record) throw new OrderVerificationError("The verification code is invalid.", 404, "not_found");
    if (record.tokenVersion !== ORDER_VERIFICATION_VERSION) throw new OrderVerificationError("The verification code version is not supported.", 400, "unsupported_version");
    const transaction = assertEligible(record, actor, new Date());
    const now = new Date();
    const claimed = await tx.orderVerification.updateMany({
      where: { id: record.id, status: "active", redeemedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { status: "redeemed", redeemedAt: now, redeemedBy: actor.id },
    });
    if (claimed.count !== 1) throw new OrderVerificationError("This order handoff has already been completed.", 409, "already_redeemed");

    const completed = await tx.order.updateMany({ where: { id: record.order.id, status: "ready" }, data: { status: "completed" } });
    if (completed.count !== 1) throw new OrderVerificationError("The order is no longer Ready for handoff.", 409, "transition_conflict");

    const handoff = await tx.orderHandoff.create({
      data: {
        id: handoffId(),
        orderId: record.order.id,
        verificationId: record.id,
        actorId: actor.id,
        actorRole: actor.role,
        outletId: record.order.outletId,
        handoffMode: record.handoffMode,
        completedAt: now,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        { id: auditId(), actorId: actor.id, actorRole: actor.role, action: "order.status_changed", entityType: "order", entityId: record.order.reference, requestId: record.id, beforeJson: JSON.stringify("ready"), afterJson: JSON.stringify("completed") },
        { id: auditId(), actorId: actor.id, actorRole: actor.role, action: "order.handoff_completed", entityType: "orderHandoff", entityId: handoff.id, requestId: record.id, afterJson: JSON.stringify({ orderReference: record.order.reference, outletId: record.order.outletId, handoffMode: record.handoffMode, verificationId: record.id, method: parsed.type }) },
      ],
    });

    return {
      duplicate: false,
      handoff: {
        id: handoff.id,
        orderReference: record.order.reference,
        outletId: record.order.outletId,
        handoffMode: record.handoffMode as HandoffMode,
        completedAt: handoff.completedAt.toISOString(),
        completedBy: actor.id,
      },
      payment: { status: transaction.status, method: transaction.paymentType, amount: transaction.amount },
    };
  });
}

export async function confirmOrderVerification(actor: VerificationActor, credentialInput: string) {
  try {
    return await confirmOnce(actor, credentialInput);
  } catch (error) {
    if (error instanceof OrderVerificationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) {
      try {
        const parsed = parseCredential(credentialInput);
        const existing = parsed.type === "token"
          ? await prisma.orderVerification.findUnique({ where: { tokenHash: parsed.hash } })
          : await prisma.orderVerification.findUnique({ where: { collectionCodeHash: parsed.hash } });
        if (existing?.status === "redeemed") throw new OrderVerificationError("This order handoff has already been completed.", 409, "already_redeemed");
      } catch {}
      throw new OrderVerificationError("Verification is temporarily busy. Check the order state before retrying.", 503, "verification_busy");
    }
    throw error;
  }
}

export async function completeOrderWithSupervisorException(input: {
  orderReference: string;
  actor: VerificationActor;
  reason: string;
}) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 5 || reason.length > 500) {
    throw new OrderVerificationError("A clear supervisor exception reason of at least 5 characters is required.", 400, "invalid_exception_reason");
  }
  if (input.actor.role !== "supervisor") {
    throw new OrderVerificationError("Only an authorized supervisor can record a handoff exception.", 403, "forbidden");
  }

  return prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { reference: input.orderReference },
      include: {
        outlet: true,
        verification: true,
        handoff: true,
        transaction: { include: { refundRequest: true, overrides: true, operaRoomCharge: true } },
      },
    });

    if (!order) throw new OrderVerificationError("The order was not found.", 404, "order_not_found");
    if (!input.actor.outlets.includes(order.outletId)) {
      throw new OrderVerificationError("This supervisor is not authorized for this order's outlet.", 403, "forbidden");
    }
    if (order.status !== "ready") {
      throw new OrderVerificationError("The order must be Ready before handoff can be confirmed.", 409, "order_not_ready");
    }
    if (order.handoff) {
      throw new OrderVerificationError("This order handoff has already been completed.", 409, "already_redeemed");
    }

    const transaction = order.transaction;
    if (!transaction) throw new OrderVerificationError("The order has no confirmed payment transaction.", 409, "payment_unconfirmed");
    if (["refunded", "voided"].includes(transaction.status)) throw new OrderVerificationError("This order is no longer eligible for handoff.", 409, "payment_reversed");
    if (managementEligibleAmount(transaction) === null) throw new OrderVerificationError("The order payment is not eligible for handoff.", 409, "payment_ineligible");
    if (transaction.refundRequest?.status === "pending" || transaction.overrides.some(item => item.status === "pending" && item.action === "void")) {
      throw new OrderVerificationError("A pending financial-control request must be resolved before handoff.", 409, "financial_review_pending");
    }
    if (transaction.paymentType === "opera_demo" && (!transaction.operaRoomCharge || transaction.operaRoomCharge.postingStatus !== "settled" || transaction.operaRoomCharge.reconciliationState === "pending")) {
      throw new OrderVerificationError("The simulated room charge is not confirmed for handoff.", 409, "opera_unconfirmed");
    }

    const now = new Date();
    const verificationId = order.verification?.id;

    if (order.verification) {
      if (order.verification.status === "redeemed" || order.verification.redeemedAt) {
        throw new OrderVerificationError("This order handoff has already been completed.", 409, "already_redeemed");
      }
      await tx.orderVerification.update({
        where: { id: order.verification.id },
        data: {
          status: "redeemed",
          redeemedAt: now,
          redeemedBy: input.actor.id,
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "completed" },
    });

    const handoff = await tx.orderHandoff.create({
      data: {
        id: handoffId(),
        orderId: order.id,
        verificationId: verificationId || order.id,
        actorId: input.actor.id,
        actorRole: input.actor.role,
        outletId: order.outletId,
        handoffMode: order.verification?.handoffMode || "counter",
        exceptionReason: reason,
        completedAt: now,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        { id: auditId(), actorId: input.actor.id, actorRole: input.actor.role, action: "order.status_changed", entityType: "order", entityId: order.reference, requestId: handoff.id, beforeJson: JSON.stringify("ready"), afterJson: JSON.stringify("completed") },
        { id: auditId(), actorId: input.actor.id, actorRole: input.actor.role, action: "order.handoff_exception", entityType: "orderHandoff", entityId: handoff.id, requestId: handoff.id, afterJson: JSON.stringify({ orderReference: order.reference, outletId: order.outletId, exceptionReason: reason, supervisorId: input.actor.id }) },
      ],
    });

    return {
      duplicate: false,
      handoff: {
        id: handoff.id,
        orderReference: order.reference,
        outletId: order.outletId,
        handoffMode: handoff.handoffMode as HandoffMode,
        exceptionReason: reason,
        completedAt: handoff.completedAt.toISOString(),
        completedBy: input.actor.id,
      },
      payment: { status: transaction.status, method: transaction.paymentType, amount: transaction.amount },
    };
  });
}
