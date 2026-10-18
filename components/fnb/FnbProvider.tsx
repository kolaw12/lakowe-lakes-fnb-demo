"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, DemoOrder, ModifierChoice } from "@/lib/fnb";
import { getItem } from "@/lib/fnb";

type FnbContextValue = {
  cart: CartItem[];
  orders: DemoOrder[];
  ready: boolean;
  addItem: (itemId: string, quantity: number, choices: ModifierChoice[]) => boolean;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearOutlet: (outletId: string) => void;
  checkout: (outletId: string, customerName: string, handoffMode?: string, destination?: string) => Promise<DemoOrder | null>;
};

const FnbContext = createContext<FnbContextValue | null>(null);
const key = "lakowe-fnb-demo-v1";

function mergeOrders(serverOrders: DemoOrder[], currentOrders: DemoOrder[]): DemoOrder[] {
  return serverOrders.map((serverOrder) => {
    const existing = currentOrders.find((o) => o.reference === serverOrder.reference);
    if (existing?.verification) {
      return { ...serverOrder, verification: existing.verification };
    }
    return serverOrder;
  });
}

export function FnbProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initialOrders: DemoOrder[] = [];
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCart(parsed.cart || []);
        initialOrders = parsed.orders || [];
        setOrders(initialOrders);
      } catch {
        localStorage.removeItem(key);
      }
    }
    fetch("/api/demo", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.orders) {
          setOrders((current) => mergeOrders(data.orders, current.length ? current : initialOrders));
        }
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(key, JSON.stringify({ version: 2, cart, orders }));
  }, [cart, orders, ready]);

  useEffect(() => {
    if (!ready) return;
    const sync = () =>
      fetch("/api/demo", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data?.orders) {
            setOrders((current) => mergeOrders(data.orders, current));
          }
        });
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [ready]);

  const value = useMemo(
    () => ({
      cart,
      orders,
      ready,
      addItem(itemId: string, quantity: number, choices: ModifierChoice[]) {
        const choiceKey = choices.map((choice) => choice.id).sort().join("-");
        const existingKey = `${itemId}-${choiceKey}`;
        setCart((current) => {
          const existing = current.find((line) => line.key === existingKey);
          return existing
            ? current.map((line) => (line.key === existingKey ? { ...line, quantity: line.quantity + quantity } : line))
            : [...current, { key: existingKey, itemId, quantity, choices }];
        });
        return true;
      },
      updateQuantity(lineKey: string, quantity: number) {
        setCart((current) => (quantity < 1 ? current.filter((line) => line.key !== lineKey) : current.map((line) => (line.key === lineKey ? { ...line, quantity } : line))));
      },
      removeItem(lineKey: string) {
        setCart((current) => current.filter((line) => line.key !== lineKey));
      },
      clearOutlet(outletId: string) {
        setCart((current) => current.filter((line) => getItem(line.itemId)?.outletId !== outletId));
      },
      async checkout(outletId: string, customerName: string, handoffMode?: string, destination?: string) {
        const outletItems = cart.filter((line) => getItem(line.itemId)?.outletId === outletId);
        if (!outletItems.length) return null;
        const response = await fetch("/api/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createOrder", outletId, customerName, items: outletItems, handoffMode, destination }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error || "Your basket could not be checked out.");
        }
        const rawOrder = result.data;
        const guestOrder: DemoOrder = rawOrder?.verification
          ? {
              ...rawOrder,
              verification: {
                token: rawOrder.verification.token,
                collectionCode: rawOrder.verification.collectionCode,
                handoffMode: rawOrder.verification.verification?.handoffMode || handoffMode || "counter",
                expiresAt: rawOrder.verification.verification?.expiresAt || new Date(Date.now() + 86400000).toISOString(),
              },
            }
          : rawOrder;

        setOrders((current) => [guestOrder, ...current.filter((o) => o.reference !== guestOrder.reference)]);
        // Keep dishes from other venues saved in the basket!
        setCart((current) => current.filter((line) => getItem(line.itemId)?.outletId !== outletId));
        return guestOrder;
      },
    }),
    [cart, orders, ready]
  );

  return <FnbContext.Provider value={value}>{children}</FnbContext.Provider>;
}

export function useFnb() {
  const context = useContext(FnbContext);
  if (!context) throw new Error("useFnb must be used within FnbProvider");
  return context;
}
