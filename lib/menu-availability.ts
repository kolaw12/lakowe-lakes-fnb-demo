import { Prisma } from "@prisma/client";
import { getItem, menuItems, outlets } from "@/lib/fnb";
import { prisma } from "@/lib/prisma";
import { getDemoStaffUser } from "@/lib/demo-db";
import { assertActiveOrderingOutlet } from "@/lib/clubhouse-config";

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
  const custom = await prisma.menuCatalogItem.findMany({ where: outletId ? { outletId } : undefined, orderBy: { createdAt: "desc" } });
  const allowed = [...(outletId ? menuItems.filter(item => item.outletId === outletId) : menuItems), ...custom.map(item => ({ id: item.id, outletId: item.outletId, name: item.name }))];
  const rows = await prisma.menuAvailability.findMany({ where: outletId ? { outletId } : undefined });
  const byKey = new Map(rows.map(row => [`${row.outletId}:${row.itemId}`, row]));
  return allowed.map(item => {
    const row = byKey.get(`${item.outletId}:${item.id}`);
    return { itemId: item.id, outletId: item.outletId, name: item.name, available: row?.available ?? true, updatedAt: row?.updatedAt?.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  });
}
export async function setMenuAvailability(actorId: string, input: { outletId: string; itemId: string; available: boolean }) {
  const actor = await getDemoStaffUser(actorId);
  assertActiveOrderingOutlet(input.outletId);
  const staticItem = getItem(input.itemId);
  const customItem = staticItem ? null : await prisma.menuCatalogItem.findUnique({ where: { id: input.itemId } });
  const item = staticItem || customItem;
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

export async function addMenuItem(actorId: string, input: { outletId: string; name: string; category: string; description: string; price: number; prepTime?: string; imageUrl?: string }) {
  const actor = await getDemoStaffUser(actorId);
  assertActiveOrderingOutlet(input.outletId);
  const name = input.name?.trim(), category = input.category?.trim(), description = input.description?.trim();
  const prepTime = input.prepTime?.trim() || null;
  const imageUrl = input.imageUrl?.trim() || "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80";
  if (!outlets.some(outlet => outlet.id === input.outletId) || !name || name.length > 80 || !category || category.length > 40 || !description || description.length > 240 || !Number.isInteger(input.price) || input.price < 100 || input.price > 50000000 || (prepTime && prepTime.length > 40) || !/^https:\/\//.test(imageUrl)) throw new MenuAvailabilityValidationError("Enter a valid outlet, dish name, category, description, price and image URL.");
  if (!actor.outlets.includes(input.outletId)) throw new MenuAvailabilityAuthorizationError("Your assigned outlets do not permit adding a dish here.");
  const id = ref("MENU");
  return prisma.$transaction(async tx => {
    const item = await tx.menuCatalogItem.create({ data: { id, outletId: input.outletId, name, category, description, price: input.price, prepTime, imageUrl, createdBy: actor.id } });
    await tx.auditEvent.create({ data: { id: ref("AUD"), actorId: actor.id, actorRole: actor.role, action: "menu.item_added", entityType: "menuItem", entityId: id, afterJson: encode({ id, outletId: item.outletId, name: item.name, category: item.category, price: item.price }) } });
    return { ...item, createdAt: item.createdAt.toISOString() };
  });
}
