import { Prisma } from "@prisma/client";
import { getItem, menuItems } from "@/lib/fnb";
import { prisma } from "@/lib/prisma";
import { getDemoStaffUser } from "@/lib/demo-db";

export class MenuAvailabilityAuthorizationError extends Error {}
export class MenuAvailabilityValidationError extends Error {}
const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const encode = (value: unknown) => JSON.stringify(value);

export type AvailabilityMap = Record<string, boolean>;
export async function availabilityForOutlet(outletId: string): Promise<AvailabilityMap> {
  const rows = await prisma.menuAvailability.findMany({ where: { outletId }, select: { itemId: true, available: true } });
  return Object.fromEntries(rows.map(row => [row.itemId, row.available]));
}
export async function assertAvailableCart(outletId: string, items: Array<{ itemId: string }>) {
  const ids = Array.from(new Set(items.map(item => item.itemId)));
  const unavailable = await prisma.menuAvailability.findMany({ where: { outletId, itemId: { in: ids }, available: false }, select: { itemId: true } });
  if (unavailable.length) {
    const names = unavailable.map(row => getItem(row.itemId)?.name || "A selected item");
    throw new MenuAvailabilityValidationError(`${names.join(", ")} is sold out. Remove it from your basket and try again.`);
  }
}
export async function menuAvailabilitySnapshot(outletId?: string) {
  const allowed = outletId ? menuItems.filter(item => item.outletId === outletId) : menuItems;
  const rows = await prisma.menuAvailability.findMany({ where: outletId ? { outletId } : undefined });
  const byKey = new Map(rows.map(row => [`${row.outletId}:${row.itemId}`, row]));
  return allowed.map(item => {
    const row = byKey.get(`${item.outletId}:${item.id}`);
    return { itemId: item.id, outletId: item.outletId, name: item.name, available: row?.available ?? true, updatedAt: row?.updatedAt?.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  });
}
export async function setMenuAvailability(actorId: string, input: { outletId: string; itemId: string; available: boolean }) {
  const actor = await getDemoStaffUser(actorId);
  const item = getItem(input.itemId);
  if (!item || item.outletId !== input.outletId || typeof input.available !== "boolean") throw new MenuAvailabilityValidationError("That menu item is not available for this outlet.");
  if (actor.role !== "staff" && actor.role !== "supervisor") throw new MenuAvailabilityAuthorizationError("Only operational staff may change menu availability.");
  if (!actor.outlets.includes(input.outletId)) throw new MenuAvailabilityAuthorizationError("Your assigned outlets do not permit this availability change.");
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const before = await tx.menuAvailability.findUnique({ where: { outletId_itemId: { outletId: input.outletId, itemId: input.itemId } } });
    const row = await tx.menuAvailability.upsert({ where: { outletId_itemId: { outletId: input.outletId, itemId: input.itemId } }, update: { available: input.available, updatedBy: actor.id }, create: { outletId: input.outletId, itemId: input.itemId, available: input.available, updatedBy: actor.id } });
    if (before?.available !== input.available) await tx.auditEvent.create({ data: { id: ref("AUD"), actorId: actor.id, actorRole: actor.role, action: "menu.availability_changed", entityType: "menuAvailability", entityId: `${input.outletId}:${input.itemId}`, beforeJson: encode({ available: before?.available ?? true }), afterJson: encode({ available: input.available, outletId: input.outletId, itemId: input.itemId, itemName: item.name }) } });
    return { itemId: row.itemId, outletId: row.outletId, available: row.available, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
  });
}
