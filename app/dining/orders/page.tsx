"use client";

import Link from "next/link";
import { DiningNav, FnbShell, StatusPill } from "@/components/fnb/FnbShell";
import { useFnb } from "@/components/fnb/FnbProvider";
import { money, outlets } from "@/lib/fnb";

export default function OrdersPage() {
  const { orders } = useFnb();
  return (
    <FnbShell>
      <section className="ll-container max-w-2xl pb-28 pt-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#9A6510]">
          Lakowe Dining History
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[#172B42] sm:text-4xl">
          Your orders
        </h1>
        <p className="mt-1.5 text-xs text-slate-500">
          Track preparation, hospitality passes, and order receipts.
        </p>

        {!orders.length ? (
          <div className="mt-8 rounded-3xl border border-slate-200/90 bg-white px-5 py-14 text-center shadow-2xs">
            <h2 className="font-serif text-xl font-bold text-[#172B42]">No orders yet</h2>
            <p className="mt-2 text-xs text-slate-500">
              Orders you create will appear here with live preparation passes.
            </p>
            <Link href="/dining" className="ll-btn ll-btn-primary mt-6 rounded-full">
              Explore menus
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3.5">
            {orders.map((order) => (
              <Link
                key={order.reference}
                href={`/dining/orders/${order.reference}`}
                className="group block rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition-all duration-200 hover:border-[#C5A56A] hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-medium text-slate-400">
                      {new Date(order.createdAt).toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <h2 className="mt-1 font-serif text-lg font-bold text-[#172B42] group-hover:text-[#9A6510] transition-colors">
                      {outlets.find((outlet) => outlet.id === order.outletId)?.name || "Dining Outlet"}
                    </h2>
                    <div className="mt-1.5 inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-mono font-bold text-[#9A6510] border border-slate-200">
                      {order.reference}
                    </div>
                  </div>
                  <StatusPill status={order.status} />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="font-medium text-slate-500">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-base font-bold text-[#172B42]">
                      {money(order.total)}
                    </span>
                    <svg className="size-4 text-slate-400 group-hover:text-[#172B42] group-hover:translate-x-0.5 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <DiningNav />
    </FnbShell>
  );
}
