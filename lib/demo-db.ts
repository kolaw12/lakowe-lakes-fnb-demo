/* eslint-disable @typescript-eslint/no-explicit-any */
import { cartTotal, getItem, outlets, type CartItem, type OrderStatus } from "@/lib/fnb";
import { prisma } from "@/lib/prisma";
import { refundSnapshot } from "@/lib/wallet-refunds";
import { assertAvailableCart } from "@/lib/menu-availability";
import { createVerificationForConfirmedOrder, normalizeFulfillment } from "@/lib/order-fulfillment";
import { completeOrderWithSupervisorException } from "@/lib/order-verification";

export const staffUsers = [
  { id: "staff-ade", name: "Ade Adebayo", role: "staff", outlets: ["clubhouse", "winebar"] },
  { id: "staff-zainab", name: "Zainab Musa", role: "staff", outlets: ["revivo", "restaurant-18"] },
  { id: "supervisor-kemi", name: "Kemi Okafor", role: "supervisor", outlets: ["clubhouse", "winebar", "revivo", "restaurant-18"] },
] as const;

const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const next: Record<OrderStatus, OrderStatus[]> = { received: ["preparing"], preparing: ["ready"], ready: ["completed"], completed: [] };
const encode = (value: unknown) => JSON.stringify(value);
const decode = <T,>(value: string | null): T | undefined => value ? JSON.parse(value) as T : undefined;

async function seed() {
  await Promise.all(staffUsers.map((u) => prisma.demoUser.upsert({ where: { id: u.id }, update: { name: u.name, role: u.role, outletIds: encode(u.outlets) }, create: { id: u.id, name: u.name, role: u.role, outletIds: encode(u.outlets) } })));
  await Promise.all(outlets.map((o) => prisma.outlet.upsert({ where: { id: o.id }, update: { name: o.name, type: o.type }, create: { id: o.id, name: o.name, type: o.type } })));
}

export async function getDemoStaffUser(id: string) {
  await seed();
  const u = await prisma.demoUser.findUnique({ where: { id } });
  if (!u) throw Error("A valid demo staff session is required.");
  return { ...u, outlets: decode<string[]>(u.outletIds) || [] };
}

async function audit(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], e: { actorId: string; actorRole: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; requestId?: string }) {
  await tx.auditEvent.create({ data: { id: ref("AUD"), actorId: e.actorId, actorRole: e.actorRole, action: e.action, entityType: e.entityType, entityId: e.entityId, beforeJson: e.before === undefined ? null : encode(e.before), afterJson: e.after === undefined ? null : encode(e.after), requestId: e.requestId } });
}

const orderDto = (o: any) => ({
  reference: o.reference,
  customerName: o.customerName,
  createdAt: o.createdAt.toISOString(),
  status: o.status,
  outletId: o.outletId,
  items: o.items.map((i: any) => ({ key: `${i.itemId}-${i.id}`, itemId: i.itemId, quantity: i.quantity, choices: decode(i.choicesJson) || [] })),
  paymentMethod: o.paymentMethod,
  subtotal: o.subtotal,
  total: o.total,
  hasVerification: Boolean(o.verification),
  verificationStatus: o.verification?.status || null,
  handoffMode: o.verification?.handoffMode || null,
});

export async function snapshot() {
  await seed();
  const [orders, transactions, overrides, auditEvents, refunds] = await Promise.all([
    prisma.order.findMany({ include: { items: true, verification: { select: { id: true, status: true, handoffMode: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.transaction.findMany({ include: { order: true }, orderBy: { createdAt: "desc" } }),
    prisma.overrideRequest.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" } }),
    refundSnapshot(),
  ]);
  return {
    orders: orders.map(orderDto),
    transactions: transactions.map((t) => ({ ...t, orderReference: t.order.reference, createdAt: t.createdAt.toISOString(), adjustment: decode(t.adjustmentJson) })),
    overrides: overrides.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), decision: r.decisionActorId ? { actorId: r.decisionActorId, reason: r.decisionReason, at: r.decidedAt?.toISOString() } : undefined })),
    audit: auditEvents.map((a) => ({ ...a, at: a.createdAt.toISOString(), before: decode(a.beforeJson), after: decode(a.afterJson) })),
    refunds,
    staffUsers,
  };
}

export async function createOrder(input: { outletId: string; customerName: string; items: CartItem[]; checkoutKey?: string; handoffMode?: unknown; destination?: unknown }) {
  await seed();
  if (!input.customerName.trim() || !input.items.length || !input.items.every((i) => getItem(i.itemId)?.outletId === input.outletId)) throw Error("Invalid demo order.");
  await assertAvailableCart(input.outletId, input.items);
  const reference = ref("LL"), total = cartTotal(input.items);
  const fulfillment = normalizeFulfillment({ outletId: input.outletId, checkoutKey: input.checkoutKey || ref("CHK"), handoffMode: input.handoffMode, destination: input.destination });
  let verification: unknown;
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference,
        customerName: input.customerName.trim(),
        outletId: input.outletId,
        status: "received",
        subtotal: total,
        total,
        paymentMethod: "demo",
        items: {
          create: input.items.map((i) => ({
            itemId: i.itemId,
            itemName: getItem(i.itemId)?.name || "Item",
            unitPrice: getItem(i.itemId)?.price || 0,
            quantity: i.quantity,
            choicesJson: encode(i.choices),
          })),
        },
      },
      include: { items: true },
    });
    await tx.transaction.create({ data: { id: ref("TXN"), orderId: order.id, outletId: input.outletId, amount: total, paymentType: "demo", status: "settled", initiatedBy: "guest-demo" } });
    verification = await createVerificationForConfirmedOrder(tx, { orderId: order.id, fulfillment });
    await audit(tx, { actorId: "guest-demo", actorRole: "guest", action: "order.created", entityType: "order", entityId: reference, after: orderDto(order) });
  });
  return { ...(await snapshot()).orders.find((o) => o.reference === reference)!, verification };
}

export class OrderStatusAuthorizationError extends Error {}
export class OrderStatusTransitionError extends Error {}

export async function updateOrder(actorId: string, reference: string, status: OrderStatus, exceptionReason?: string) {
  const u = await getDemoStaffUser(actorId);
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { verification: true },
  });
  if (!order) throw new OrderStatusTransitionError("That order was not found.");
  if (!u.outlets.includes(order.outletId)) throw new OrderStatusAuthorizationError("Your assigned outlets do not permit this order update.");
  if (!next[order.status as OrderStatus].includes(status)) throw new OrderStatusTransitionError("That order status transition is not permitted.");

  // Check mandatory verification rule for ready -> completed
  if (order.status === "ready" && status === "completed") {
    if (order.verification && order.verification.status === "active") {
      if (exceptionReason && u.role === "supervisor") {
        await completeOrderWithSupervisorException({
          orderReference: reference,
          actor: { id: u.id, role: u.role, outlets: u.outlets },
          reason: exceptionReason,
        });
        return (await snapshot()).orders.find((o) => o.reference === reference)!;
      }
      throw new OrderStatusTransitionError("Newly QR-enabled orders require verified handoff (scan QR or enter collection code) or an authorized supervisor exception to complete.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { reference }, data: { status } });
    await audit(tx, { actorId, actorRole: u.role, action: "order.status_changed", entityType: "order", entityId: reference, before: order.status, after: status });
  });
  return (await snapshot()).orders.find((o) => o.reference === reference)!;
}

export async function requestOverride(actorId: string, input: { transactionId: string; action: "void" | "discount"; reason: string; proposedAmount?: number }) {
  const u = await getDemoStaffUser(actorId), t = await prisma.transaction.findUnique({ where: { id: input.transactionId } });
  if (!t || !u.outlets.includes(t.outletId) || t.adjustmentJson || !input.reason.trim()) throw Error("This controlled action cannot be requested.");
  const id = ref("OVR");
  await prisma.$transaction(async (tx) => {
    await tx.overrideRequest.create({ data: { id, transactionId: t.id, actorId, action: input.action, reason: input.reason.trim(), proposedAmount: input.proposedAmount, status: "pending" } });
    await audit(tx, { actorId, actorRole: u.role, action: "override.requested", entityType: "override", entityId: id, requestId: id });
  });
  return (await snapshot()).overrides.find((r) => r.id === id)!;
}

export async function decideOverride(actorId: string, requestId: string, decision: "approved" | "rejected", reason: string) {
  const u = await getDemoStaffUser(actorId);
  if (u.role !== "supervisor" || !reason.trim()) throw Error("This approval decision is not permitted.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.overrideRequest.findUnique({ where: { id: requestId } });
    if (!r || r.actorId === actorId || r.status !== "pending") throw Error("This approval decision is not permitted.");
    const t = await tx.transaction.findUnique({ where: { id: r.transactionId } });
    if (!t || (decision === "approved" && t.adjustmentJson)) throw Error("Transaction adjustment is not permitted.");
    await tx.overrideRequest.update({ where: { id: requestId }, data: { status: decision, decisionActorId: actorId, decisionReason: reason.trim(), decidedAt: new Date() } });
    if (decision === "approved") {
      const adjustment = { type: r.action, amount: r.proposedAmount, reference: requestId }, status = r.action === "void" ? "voided" : "discounted";
      await tx.transaction.update({ where: { id: t.id }, data: { status, adjustmentJson: encode(adjustment) } });
      await audit(tx, { actorId, actorRole: u.role, action: "transaction.adjusted", entityType: "transaction", entityId: t.id, before: { status: t.status }, after: { status, adjustment }, requestId });
    }
    await audit(tx, { actorId, actorRole: u.role, action: `override.${decision}`, entityType: "override", entityId: requestId, requestId });
  });
  return (await snapshot()).overrides.find((r) => r.id === requestId)!;
}
