import { prisma } from "@/lib/prisma";
import { cartTotal, getItem, type CartItem } from "@/lib/fnb";
import { assertAvailableCart } from "@/lib/menu-availability";
import { createVerificationForConfirmedOrder, normalizeFulfillment } from "@/lib/order-fulfillment";

export const DEMO_GOLFER = "golfer-demo";
const ref = (prefix: string) => prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

async function account() {
  await prisma.demoUser.upsert({ where: { id: DEMO_GOLFER }, update: {}, create: { id: DEMO_GOLFER, name: "Tunde Adeyemi", role: "golfer", outletIds: "[]" } });
  return prisma.walletAccount.upsert({ where: { userId: DEMO_GOLFER }, update: {}, create: { userId: DEMO_GOLFER, balance: 0 } });
}

export async function walletSnapshot() {
  const wallet = await account();
  const entries = await prisma.walletLedgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" } });
  return { owner: "Tunde Adeyemi", balance: wallet.balance, entries: entries.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() })), spending: entries.filter(entry => (entry.type === "purchase" || entry.type === "refund") && entry.status === "posted").reduce((total, entry) => total + entry.amount, 0) * -1 };
}

export async function deposit(amount: number, idempotencyKey: string) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 50000000 || !idempotencyKey) throw Error("Enter a valid demo deposit amount.");
  const wallet = await account();
  return prisma.$transaction(async transaction => {
    const existing = await transaction.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const reference = ref("DEP");
    const entry = await transaction.walletLedgerEntry.create({ data: { walletId: wallet.id, amount, type: "deposit", description: "Demo deposit. No real money is transferred.", reference, idempotencyKey } });
    await transaction.walletAccount.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await transaction.depositRecord.create({ data: { userId: DEMO_GOLFER, amount, status: "simulated_success", reference } });
    await transaction.auditEvent.create({ data: { id: ref("AUD"), actorId: DEMO_GOLFER, actorRole: "golfer", action: "wallet.deposit", entityType: "walletLedger", entityId: entry.id, afterJson: JSON.stringify({ amount, reference }) } });
    return entry;
  });
}

export async function walletCheckout(input: { outletId: string; customerName: string; items: CartItem[]; idempotencyKey: string; handoffMode?: unknown; destination?: unknown }) {
  const wallet = await account();
  if (!input.idempotencyKey || !input.items.length || !input.items.every(item => getItem(item.itemId)?.outletId === input.outletId)) throw Error("Invalid wallet order.");
  await assertAvailableCart(input.outletId, input.items);
  const total = cartTotal(input.items);
  const fulfillment = normalizeFulfillment({ outletId: input.outletId, checkoutKey: input.idempotencyKey, handoffMode: input.handoffMode, destination: input.destination });
  return prisma.$transaction(async transaction => {
    const existing = await transaction.walletLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const order = await transaction.order.findUnique({ where: { reference: existing.orderReference || "" }, include: { items: true } });
      return { order, balance: wallet.balance, credentialRecoveryUnavailable: true };
    }
    const debited = await transaction.walletAccount.updateMany({ where: { id: wallet.id, balance: { gte: total } }, data: { balance: { decrement: total } } });
    if (!debited.count) throw Error("Insufficient wallet balance.");
    const reference = ref("LL");
    const order = await transaction.order.create({
      data: {
        reference,
        customerName: input.customerName || "Demo golfer",
        outletId: input.outletId,
        status: "received",
        subtotal: total,
        total,
        paymentMethod: "wallet_demo",
        items: { create: input.items.map(item => ({ itemId: item.itemId, itemName: getItem(item.itemId)?.name || "Item", unitPrice: getItem(item.itemId)?.price || 0, quantity: item.quantity, choicesJson: JSON.stringify(item.choices) })) },
      },
      include: { items: true },
    });
    await transaction.transaction.create({ data: { id: ref("TXN"), orderId: order.id, outletId: input.outletId, amount: total, paymentType: "wallet_demo", status: "settled", initiatedBy: DEMO_GOLFER } });
    const verification = await createVerificationForConfirmedOrder(transaction, { orderId: order.id, fulfillment });
    const entry = await transaction.walletLedgerEntry.create({ data: { walletId: wallet.id, amount: -total, type: "purchase", description: "Food order", orderReference: reference, reference: ref("WAL"), idempotencyKey: input.idempotencyKey } });
    await transaction.auditEvent.create({ data: { id: ref("AUD"), actorId: DEMO_GOLFER, actorRole: "golfer", action: "wallet.purchase", entityType: "order", entityId: reference, afterJson: JSON.stringify({ total, ledger: entry.id }) } });
    const balance = await transaction.walletAccount.findUniqueOrThrow({ where: { id: wallet.id } });
    return { order, balance: balance.balance, verification };
  });
}
