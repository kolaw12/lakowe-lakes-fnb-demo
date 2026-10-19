"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, DemoOrder, ModifierChoice } from "@/lib/fnb";
import { getItem } from "@/lib/fnb";
import { guestStorageKey, mergeOrders, normalizeGuestOrder, readGuestState, writeGuestState, type GuestState } from "@/lib/guest-storage";

type FnbContextValue = {
  cart: CartItem[];
  orders: DemoOrder[];
  ready: boolean;
  syncError: string;
  rememberOrder: (order: DemoOrder, outletId?: string) => void;
  addItem: (itemId: string, quantity: number, choices: ModifierChoice[]) => boolean;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearOutlet: (outletId: string) => void;
  checkout: (outletId: string, customerName: string, handoffMode?: string, destination?: string) => Promise<DemoOrder | null>;
};

const FnbContext = createContext<FnbContextValue | null>(null);
export function FnbProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GuestState>({ cart: [], orders: [] });
  const currentState = useRef(state);
  const { cart, orders } = state;
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");

  const commit = useCallback((update: (current: GuestState) => GuestState) => {
    // Read the latest tab's state before writing, including its private receipt data.
    const next = update(readGuestState() || currentState.current);
    currentState.current = next;
    writeGuestState(next);
    setState(next);
  }, []);

  const setCart = useCallback((update: (cart: CartItem[]) => CartItem[]) => {
    commit(current => ({ ...current, cart: update(current.cart) }));
  }, [commit]);

  const rememberOrder = useCallback((order: DemoOrder, outletId?: string) => {
    commit(current => ({
      orders: mergeOrders([normalizeGuestOrder(order)], current.orders),
      cart: outletId ? current.cart.filter(line => getItem(line.itemId)?.outletId !== outletId) : current.cart,
    }));
  }, [commit]);

  useEffect(() => {
    let active = true;
    let fetching = false;
    const saved = readGuestState();
    if (saved) {
      currentState.current = saved;
      setState(saved);
    }
    const sync = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/demo", { cache: "no-store" });
        if (!response.ok) throw new Error("Orders unavailable");
        const data = await response.json();
        if (!Array.isArray(data?.orders)) throw new Error("Orders unavailable");
        if (active) {
          commit(current => ({ ...current, orders: mergeOrders(data.orders, current.orders) }));
          setSyncError("");
        }
      } catch {
        if (active) setSyncError("Order updates are temporarily unavailable. Saved receipts are still available; please try again shortly.");
      } finally {
        fetching = false;
        if (active) setReady(true);
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== guestStorageKey) return;
      const latest = readGuestState();
      if (latest) {
        currentState.current = latest;
        setState(latest);
      }
    };
    const focus = () => { void sync(); };
    void sync();
    const interval = setInterval(focus, 5000);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [commit]);

  const value = useMemo(
    () => ({
      cart,
      orders,
      ready,
      syncError,
      rememberOrder,
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

        rememberOrder(guestOrder, outletId);
        return guestOrder;
      },
    }),
    [cart, orders, ready, syncError, rememberOrder, setCart]
  );

  return <FnbContext.Provider value={value}>{children}</FnbContext.Provider>;
}

export function useFnb() {
  const context = useContext(FnbContext);
  if (!context) throw new Error("useFnb must be used within FnbProvider");
  return context;
}
