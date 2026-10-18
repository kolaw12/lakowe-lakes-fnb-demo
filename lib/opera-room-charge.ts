import { Prisma, type OperaRoomChargeAttempt } from "@prisma/client";
import { cartTotal, getItem, type CartItem, type DemoOrder, type ModifierChoice } from "@/lib/fnb";
import { getOperaAdapter, type OperaPostingStatus, type OperaScenario } from "@/lib/opera-demo-adapter";
import { prisma } from "@/lib/prisma";
import { assertAvailableCart } from "@/lib/menu-availability";
import { createVerificationForConfirmedOrder, normalizeFulfillment } from "@/lib/order-fulfillment";

type CheckoutPayload = {
  outletId: string;
  customerName: string;
  items: CartItem[];
  handoffMode?: unknown;
  destination?: unknown;
};

export type OperaCheckoutInput = Omit<CheckoutPayload, "items"> & {
  items: unknown;
  roomReference: string;
  guestSurname: string;
  verificationCode: string;
  idempotencyKey: string;
  handoffMode?: unknown;
  destination?: unknown;
};

export type OperaAttemptResult = {
  duplicate: boolean;
  outcome: "confirmed" | "rejected" | "pending";
  attempt: {
    id: string;
    orderReference: string;
    roomReferenceMasked: string;
    guestNameMasked: string;
    amount: number;
    verificationStatus: string;
    postingStatus: string;
    postingReference: string | null;
    reconciliationState: string;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  order: DemoOrder | null;
  verification?: {
    token: string;
    collectionCode: string;
    verification: { id: string; handoffMode: string; expiresAt: string; destinationHint: string | null };
  };
  credentialRecoveryUnavailable?: boolean;
};

const encode = (value: unknown) => JSON.stringify(value);
const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
function parse<T>(value: string): T { return JSON.parse(value) as T; }
function clean(value: unknown, maximum: number) { return typeof value === "string" && value.trim().length <= maximum ? value.trim() : ""; }

export function maskRoomReference(roomReference: string) {
  const visible = roomReference.slice(-2);
  return `Room ${"•".repeat(Math.max(1, roomReference.length - 2))}${visible}`;
}

function maskGuestName(name: string | null) {
  if (!name) return "Unavailable";
  return name.split(/\s+/).map(part => part.length <= 2 ? `${part[0] || ""}•` : `${part[0]}${"•".repeat(part.length - 2)}${part.at(-1)}`).join(" ");
}

function normalizeCart(outletId: string, input: unknown): CartItem[] {
  if (!Array.isArray(input) || !input.length || input.length > 30) throw new Error("Add valid demo menu items before charging a room.");
  return input.map((raw, lineIndex) => {
    if (!raw || typeof raw !== "object" || !("itemId" in raw) || !("quantity" in raw) || !("choices" in raw)) throw new Error("The demo basket is invalid.");
    const itemId = typeof raw.itemId === "string" ? raw.itemId : "";
    const item = getItem(itemId);
    const quantity = Number(raw.quantity);
    if (!item || item.outletId !== outletId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !Array.isArray(raw.choices)) throw new Error("The demo basket is invalid.");
    const rawChoices: unknown[] = raw.choices;
    const submittedIds = rawChoices.map(choice => choice && typeof choice === "object" && "id" in choice && typeof choice.id === "string" ? choice.id : "");
    if (new Set(submittedIds).size !== submittedIds.length) throw new Error("The demo basket contains duplicate choices.");
    const canonical: ModifierChoice[] = [];
    for (const group of item.modifiers || []) {
      const selected = group.choices.filter(choice => submittedIds.includes(choice.id));
      if (group.required && selected.length !== 1) throw new Error("Select the required choice for each item.");
      canonical.push(...selected);
    }
    const known = new Set((item.modifiers || []).flatMap(modifier => modifier.choices.map(choice => choice.id)));
    if (submittedIds.some(id => !known.has(id))) throw new Error("The demo basket contains an invalid choice.");
    return { key: typeof (raw as { key?: unknown }).key === "string" ? String((raw as { key: string }).key) : `${itemId}-${lineIndex}`, itemId, quantity, choices: canonical };
  });
}

async function audit(tx: Prisma.TransactionClient, event: { actorId: string; actorRole: string; action: string; entityId: string; before?: unknown; after?: unknown }) {
  await tx.auditEvent.create({ data: { id: ref("AUD"), actorId: event.actorId, actorRole: event.actorRole, action: event.action, entityType: "operaRoomCharge", entityId: event.entityId, requestId: event.entityId, beforeJson: event.before === undefined ? null : encode(event.before), afterJson: event.after === undefined ? null : encode(event.after) } });
}

function orderDto(order: { reference: string; customerName: string; createdAt: Date; status: string; outletId: string; paymentMethod: string; subtotal: number; total: number; items: Array<{ id: string; itemId: string; quantity: number; choicesJson: string }> }): DemoOrder {
  return { reference: order.reference, customerName: order.customerName, createdAt: order.createdAt.toISOString(), status: order.status as DemoOrder["status"], outletId: order.outletId, items: order.items.map(item => ({ key: `${item.itemId}-${item.id}`, itemId: item.itemId, quantity: item.quantity, choices: parse<ModifierChoice[]>(item.choicesJson) })), paymentMethod: order.paymentMethod as DemoOrder["paymentMethod"], subtotal: order.subtotal, total: order.total };
}

async function resultFor(
  attempt: OperaRoomChargeAttempt,
  duplicate: boolean,
  verification?: {
    token: string;
    collectionCode: string;
    verification: { id: string; handoffMode: string; expiresAt: string; destinationHint: string | null };
  } | null
): Promise<OperaAttemptResult> {
  const order = attempt.orderId ? await prisma.order.findUnique({ where: { id: attempt.orderId }, include: { items: true } }) : null;
  return {
    duplicate,
    outcome: attempt.postingStatus === "settled" ? "confirmed" : attempt.postingStatus === "uncertain" ? "pending" : "rejected",
    attempt: {
      id: attempt.id,
      orderReference: attempt.orderReference,
      roomReferenceMasked: maskRoomReference(attempt.roomReference),
      guestNameMasked: attempt.guestNameMasked,
      amount: attempt.amount,
      verificationStatus: attempt.verificationStatus,
      postingStatus: attempt.postingStatus,
      postingReference: attempt.postingReference,
      reconciliationState: attempt.reconciliationState,
      failureReason: attempt.failureReason,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    },
    order: order ? orderDto(order) : null,
    ...(verification ? { verification } : {}),
    ...(duplicate && attempt.orderId ? { credentialRecoveryUnavailable: true } : {}),
  };
}

async function finalizePosting(attempt: OperaRoomChargeAttempt, postingReference: string, actor: { id: string; role: string }, reconciliation: boolean) {
  const checkout = parse<CheckoutPayload>(attempt.checkoutJson);
  const fulfillment = normalizeFulfillment({
    outletId: checkout.outletId,
    checkoutKey: attempt.idempotencyKey,
    handoffMode: checkout.handoffMode,
    destination: checkout.destination,
  });

  return prisma.$transaction(async tx => {
    const current = await tx.operaRoomChargeAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    if (current.orderId) return { attempt: current, verification: null };
    const order = await tx.order.create({
      data: {
        reference: current.orderReference,
        customerName: checkout.customerName,
        outletId: checkout.outletId,
        status: "received",
        subtotal: current.amount,
        total: current.amount,
        paymentMethod: "opera_demo",
        items: {
          create: checkout.items.map(item => ({
            itemId: item.itemId,
            itemName: getItem(item.itemId)?.name || "Item",
            unitPrice: getItem(item.itemId)?.price || 0,
            quantity: item.quantity,
            choicesJson: encode(item.choices),
          })),
        },
      },
      include: { items: true },
    });
    const transaction = await tx.transaction.create({
      data: {
        id: ref("TXN"),
        orderId: order.id,
        outletId: checkout.outletId,
        amount: current.amount,
        paymentType: "opera_demo",
        status: "settled",
        initiatedBy: current.initiatedBy,
      },
    });
    const verification = await createVerificationForConfirmedOrder(tx, { orderId: order.id, fulfillment });
    const updated = await tx.operaRoomChargeAttempt.update({
      where: { id: current.id },
      data: {
        orderId: order.id,
        transactionId: transaction.id,
        postingStatus: "settled",
        postingReference,
        reconciliationState: reconciliation ? "resolved" : "not_required",
        failureReason: null,
        lastCheckedAt: new Date(),
      },
    });
    await audit(tx, { actorId: current.initiatedBy, actorRole: current.initiatorRole, action: "order.created", entityId: current.id, after: { orderReference: order.reference, transactionId: transaction.id, paymentType: "opera_demo", amount: current.amount } });
    await audit(tx, { actorId: actor.id, actorRole: actor.role, action: reconciliation ? "opera.room_charge.reconciled" : "opera.room_charge.posting_result", entityId: current.id, before: { postingStatus: current.postingStatus }, after: { postingStatus: "settled", postingReference, orderReference: order.reference, transactionId: transaction.id } });
    return { attempt: updated, verification };
  });
}

export async function checkoutWithOpera(input: OperaCheckoutInput): Promise<OperaAttemptResult> {
  const idempotencyKey = clean(input.idempotencyKey, 100), outletId = clean(input.outletId, 60), customerName = clean(input.customerName, 80);
  const roomReference = clean(input.roomReference, 12), guestSurname = clean(input.guestSurname, 60), verificationCode = clean(input.verificationCode, 40).toUpperCase();
  if (!/^[A-Za-z0-9-]{8,100}$/.test(idempotencyKey) || !customerName || !/^\d{3,6}$/.test(roomReference) || !/^[A-Za-z][A-Za-z '-]{1,59}$/.test(guestSurname) || !verificationCode) throw new Error("Enter valid fictional room verification details.");
  const items = normalizeCart(outletId, input.items);
  await assertAvailableCart(outletId, items);
  const amount = cartTotal(items);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000000) throw new Error("The demo order total is invalid.");
  const existing = await prisma.operaRoomChargeAttempt.findUnique({ where: { idempotencyKey } });
  if (existing) return resultFor(existing, true);
  const attemptId = ref("OPRATT"), orderReference = ref("LL");
  let attempt: OperaRoomChargeAttempt;
  try {
    attempt = await prisma.$transaction(async tx => {
      const created = await tx.operaRoomChargeAttempt.create({
        data: {
          id: attemptId,
          idempotencyKey,
          orderReference,
          outletId,
          amount,
          roomReference,
          guestNameMasked: "Pending verification",
          checkoutJson: encode({ outletId, customerName, items, handoffMode: input.handoffMode, destination: input.destination }),
          verificationStatus: "pending",
          postingStatus: "not_attempted",
          reconciliationState: "not_required",
          initiatedBy: "guest-demo",
          initiatorRole: "guest",
        },
      });
      await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "opera.room_charge.initiated", entityId: created.id, after: { orderReference, outletId, amount, roomReference: maskRoomReference(roomReference) } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.operaRoomChargeAttempt.findUniqueOrThrow({ where: { idempotencyKey } });
      return resultFor(duplicate, true);
    }
    throw error;
  }
  const adapter = getOperaAdapter();
  const verification = await adapter.validateRoom({ roomReference, guestSurname, verificationCode });
  attempt = await prisma.$transaction(async tx => {
    const updated = await tx.operaRoomChargeAttempt.update({ where: { id: attempt.id }, data: { verificationStatus: verification.status, guestNameMasked: maskGuestName(verification.guestDisplayName), scenario: verification.scenario, failureReason: verification.reason } });
    await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "opera.room_charge.verification", entityId: attempt.id, before: { verificationStatus: "pending" }, after: { verificationStatus: verification.status, occupied: verification.occupied, guestAuthorized: verification.guestAuthorized, chargingPermitted: verification.chargingPermitted, reason: verification.reason } });
    return updated;
  });
  if (verification.status !== "eligible" || !verification.scenario) return resultFor(attempt, false);
  attempt = await prisma.$transaction(async tx => {
    const updated = await tx.operaRoomChargeAttempt.update({ where: { id: attempt.id }, data: { postingStatus: "uncertain", reconciliationState: "pending", failureReason: "Posting attempt is awaiting a deterministic mock result." } });
    await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "opera.room_charge.posting_attempt", entityId: attempt.id, after: { amount, roomReference: maskRoomReference(roomReference), scenario: verification.scenario } });
    return updated;
  });
  let posting: { status: Exclude<OperaPostingStatus, "not_attempted">; postingReference: string | null; reason: string | null };
  try {
    posting = await adapter.submitFolioCharge({ attemptId: attempt.id, orderReference, roomReference, amount, scenario: verification.scenario as OperaScenario });
  } catch {
    posting = { status: "uncertain", postingReference: null, reason: "The simulated posting call ended without a confirmed result. Management reconciliation is required." };
  }
  if (posting.status === "settled" && posting.postingReference) {
    try {
      const finalized = await finalizePosting(attempt, posting.postingReference, { id: "guest-demo", role: "guest" }, false);
      return resultFor(finalized.attempt, false, finalized.verification);
    } catch {
      attempt = await prisma.$transaction(async tx => {
        const updated = await tx.operaRoomChargeAttempt.update({ where: { id: attempt.id }, data: { postingStatus: "uncertain", postingReference: posting.postingReference, reconciliationState: "pending", failureReason: "The simulated posting was confirmed but local recording did not complete. Management reconciliation is required.", lastCheckedAt: new Date() } });
        await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "opera.room_charge.posting_result", entityId: attempt.id, before: { postingStatus: "uncertain" }, after: { postingStatus: "uncertain", postingReference: posting.postingReference, reconciliationState: "pending", reason: updated.failureReason } });
        return updated;
      });
      return resultFor(attempt, false);
    }
  }
  attempt = await prisma.$transaction(async tx => {
    const reconciliationState = posting.status === "uncertain" ? "pending" : posting.status === "unavailable" ? "manual_review" : "not_required";
    const updated = await tx.operaRoomChargeAttempt.update({ where: { id: attempt.id }, data: { postingStatus: posting.status, postingReference: posting.postingReference, reconciliationState, failureReason: posting.reason, lastCheckedAt: new Date() } });
    await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "opera.room_charge.posting_result", entityId: attempt.id, before: { postingStatus: "uncertain" }, after: { postingStatus: posting.status, postingReference: posting.postingReference, reconciliationState, reason: posting.reason } });
    return updated;
  });
  return resultFor(attempt, false);
}

export async function getGuestOperaAttempt(idempotencyKey: string) {
  const key = clean(idempotencyKey, 100);
  if (!key) throw new Error("A valid demo checkout key is required.");
  const attempt = await prisma.operaRoomChargeAttempt.findUnique({ where: { idempotencyKey: key } });
  if (!attempt) throw new Error("That simulated room-charge attempt was not found.");
  return resultFor(attempt, true);
}

export async function reconcileOperaAttempt(attemptId: string, actor: { id: string; role: string }) {
  let attempt = await prisma.operaRoomChargeAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error("That simulated posting attempt was not found.");
  if (attempt.postingStatus === "settled") return resultFor(attempt, true);
  if (attempt.postingStatus !== "uncertain" || attempt.reconciliationState !== "pending" || !attempt.postingReference) throw new Error("This simulated posting is not eligible for safe reconciliation.");
  await prisma.$transaction(async tx => {
    await audit(tx, { actorId: actor.id, actorRole: actor.role, action: "opera.room_charge.reconciliation_requested", entityId: attempt!.id, after: { postingReference: attempt!.postingReference } });
    await tx.operaRoomChargeAttempt.update({ where: { id: attempt!.id }, data: { lastCheckedAt: new Date() } });
  });
  const posting = await getOperaAdapter().retrievePostingResult(attempt.postingReference);
  if (posting.status === "settled" && posting.postingReference) {
    const finalized = await finalizePosting(attempt, posting.postingReference, actor, true);
    return resultFor(finalized.attempt, true);
  }
  attempt = await prisma.$transaction(async tx => {
    const state = posting.status === "uncertain" ? "pending" : posting.status === "unavailable" ? "manual_review" : "resolved";
    const updated = await tx.operaRoomChargeAttempt.update({ where: { id: attempt!.id }, data: { postingStatus: posting.status, reconciliationState: state, failureReason: posting.reason, lastCheckedAt: new Date() } });
    await audit(tx, { actorId: actor.id, actorRole: actor.role, action: "opera.room_charge.reconciled", entityId: attempt!.id, before: { postingStatus: attempt!.postingStatus }, after: { postingStatus: posting.status, reconciliationState: state, reason: posting.reason } });
    return updated;
  });
  return resultFor(attempt, false);
}
