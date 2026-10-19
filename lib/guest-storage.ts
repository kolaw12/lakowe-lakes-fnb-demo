import type { CartItem, DemoOrder } from "@/lib/fnb";

export const guestStorageKey = "lakowe-fnb-demo-v1";
export type GuestState = { cart: CartItem[]; orders: DemoOrder[] };

export function readGuestState(): GuestState | null {
  try {
    const value = JSON.parse(localStorage.getItem(guestStorageKey) || "null");
    if (!value || !Array.isArray(value.cart) || !Array.isArray(value.orders)) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeGuestState(state: GuestState) {
  try {
    localStorage.setItem(guestStorageKey, JSON.stringify({ version: 2, ...state }));
  } catch {
    // The server already committed checkout. Keep the receipt in memory.
  }
}

export function mergeOrders(incoming: DemoOrder[], saved: DemoOrder[]): DemoOrder[] {
  const orders = new Map(saved.map(order => [order.reference, order]));
  for (const order of incoming) {
    const existing = orders.get(order.reference);
    orders.set(order.reference, {
      ...order,
      // Public snapshots intentionally omit private guest handoff credentials.
      ...(order.verification || existing?.verification
        ? { verification: order.verification || existing?.verification }
        : {}),
    });
  }
  // An empty or delayed snapshot must never delete a confirmed local receipt.
  return Array.from(orders.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Wallet responses include database item rows; normalize them before rendering.
export function normalizeGuestOrder(order: DemoOrder): DemoOrder {
  return {
    ...order,
    items: order.items.map((line: CartItem & { id?: string; choicesJson?: string }) => ({
      key: line.key || `${line.itemId}-${line.id}`,
      itemId: line.itemId,
      quantity: line.quantity,
      choices: line.choices || JSON.parse(line.choicesJson || "[]"),
    })),
  };
}
