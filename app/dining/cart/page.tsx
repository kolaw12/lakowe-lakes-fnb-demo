"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FnbShell } from "@/components/fnb/FnbShell";
import { useFnb } from "@/components/fnb/FnbProvider";
import { cartLineTotal, cartTotal, getItem, money, outlets, type Outlet } from "@/lib/fnb";

export default function CartPage() {
  const { cart, updateQuantity, removeItem } = useFnb();
  const [activeTab, setActiveTab] = useState<string>("all");

  const grandTotal = cartTotal(cart);

  // Group items by outlet
  const outletGroups = useMemo(() => {
    const map = new Map<string, { outlet: Outlet; items: typeof cart; subtotal: number }>();
    for (const line of cart) {
      const dish = getItem(line.itemId);
      if (!dish) continue;
      const out = outlets.find((o) => o.id === dish.outletId);
      if (!out) continue;
      if (!map.has(out.id)) {
        map.set(out.id, { outlet: out, items: [], subtotal: 0 });
      }
      const entry = map.get(out.id)!;
      entry.items.push(line);
      entry.subtotal += cartLineTotal(line);
    }
    return Array.from(map.values());
  }, [cart]);

  const visibleGroups = useMemo(() => {
    if (activeTab === "all") return outletGroups;
    return outletGroups.filter((g) => g.outlet.id === activeTab);
  }, [outletGroups, activeTab]);

  return (
    <FnbShell backHref="/dining" title="Continue browsing">
      <section className="ll-container max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="ll-eyebrow">YOUR BASKET</p>
            <h1 className="ll-page-title mt-1 font-serif text-3xl font-bold text-[#172B42]">
              Review your order
            </h1>
          </div>
          {cart.length > 0 && (
            <span className="rounded-full bg-slate-100 px-3.5 py-1 text-xs font-bold text-slate-700 border border-slate-200">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} total dish{cart.length === 1 ? "" : "es"}
            </span>
          )}
        </div>

        {!cart.length ? (
          <div className="ll-panel-muted mt-8 rounded-3xl border border-slate-200/90 bg-white px-5 py-16 text-center shadow-xs">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-slate-100 text-[#172B42]">
              <svg className="size-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <h2 className="mt-4 font-serif text-xl font-bold text-[#172B42]">Your basket is empty</h2>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
              Explore our dining and lounge menus to add dishes and drinks from across the resort.
            </p>
            <Link
              href="/dining"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#172B42] px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-[#0F2133] active:scale-95"
            >
              Explore dining
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Multi-Venue Explanation & Tab Switcher */}
            {outletGroups.length > 1 && (
              <div className="rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E5C384]/20 text-[#9A6510]">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#172B42]">
                      Multi-Venue Order ({outletGroups.length} venues)
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Dishes are grouped by venue kitchen. Check out each venue individually; your other dishes remain safely saved in your basket.
                    </p>
                  </div>
                </div>

                {/* Venue Filter Tabs */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                      activeTab === "all"
                        ? "bg-[#172B42] text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <span>All Venues</span>
                    <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                      {outletGroups.length}
                    </span>
                  </button>

                  {outletGroups.map((g) => {
                    const isActive = activeTab === g.outlet.id;
                    return (
                      <button
                        key={g.outlet.id}
                        type="button"
                        onClick={() => setActiveTab(g.outlet.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                          isActive
                            ? "bg-[#172B42] text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <span>{g.outlet.name}</span>
                        <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                          {g.items.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Render Venue Groups */}
            <div className="space-y-6">
              {visibleGroups.map((group) => {
                return (
                  <article
                    key={group.outlet.id}
                    className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs"
                  >
                    {/* Venue Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1E3858] to-[#122336] text-sm font-bold text-[#E5C384] shadow-2xs">
                          {group.outlet.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="font-serif text-lg font-bold text-[#172B42]">
                              {group.outlet.name}
                            </h2>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              {group.outlet.type}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-500">
                            Dedicated kitchen &amp; pickup station
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
                        {group.items.length} dish{group.items.length === 1 ? "" : "es"}
                      </span>
                    </div>

                    {/* Venue Items List */}
                    <div className="divide-y divide-slate-100">
                      {group.items.map((line) => {
                        const dish = getItem(line.itemId);
                        if (!dish) return null;
                        return (
                          <div
                            key={line.key}
                            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-3.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={dish.image}
                                alt={dish.name}
                                className="size-16 shrink-0 rounded-2xl object-cover border border-slate-100"
                              />
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-bold text-[#172B42]">
                                  {dish.name}
                                </h3>
                                {line.choices.length > 0 && (
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {line.choices.map((c) => c.name).join(", ")}
                                  </p>
                                )}
                                <span className="mt-1 block font-serif text-xs font-bold text-[#9A6510]">
                                  {money(dish.price)} each
                                </span>
                              </div>
                            </div>

                            {/* Stepper + Total + Remove */}
                            <div className="flex items-center justify-between gap-4 sm:justify-end">
                              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  aria-label={"Reduce " + dish.name}
                                  onClick={() => updateQuantity(line.key, line.quantity - 1)}
                                  className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[#172B42] shadow-2xs transition hover:bg-slate-100 active:scale-95"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center text-xs font-bold text-[#172B42]">
                                  {line.quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={"Increase " + dish.name}
                                  onClick={() => updateQuantity(line.key, line.quantity + 1)}
                                  className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[#172B42] shadow-2xs transition hover:bg-slate-100 active:scale-95"
                                >
                                  +
                                </button>
                              </div>

                              <span className="font-serif text-sm font-bold text-[#172B42] min-w-[70px] text-right">
                                {money(cartLineTotal(line))}
                              </span>

                              <button
                                type="button"
                                onClick={() => removeItem(line.key)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Venue Checkout Footer Bar */}
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {group.outlet.name} Subtotal
                        </span>
                        <span className="font-serif text-xl font-bold text-[#172B42]">
                          {money(group.subtotal)}
                        </span>
                      </div>

                      <Link
                        href={`/dining/checkout?outlet=${group.outlet.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#172B42] px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-[#0F2133] active:scale-95"
                      >
                        <span>Checkout {group.outlet.name}</span>
                        <svg className="size-4 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Bottom Total Bar */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-medium text-slate-500">
                  Total across all venues
                </span>
                <span className="font-serif text-2xl font-bold text-[#172B42]">
                  {money(grandTotal)}
                </span>
              </div>
              <Link
                href="/dining"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-[#172B42] shadow-2xs hover:bg-slate-100 transition active:scale-95"
              >
                + Add more dishes
              </Link>
            </div>
          </div>
        )}
      </section>
    </FnbShell>
  );
}