"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FnbShell, StatusPill } from "@/components/fnb/FnbShell";
import { OrderVerificationQr } from "@/components/fnb/OrderVerificationQr";
import { useFnb } from "@/components/fnb/FnbProvider";
import { getItem, money, outlets, type OrderStatus } from "@/lib/fnb";

const stages: { id: OrderStatus; title: string; text: string }[] = [
  { id: "received", title: "Received", text: "Your order is with the kitchen." },
  { id: "preparing", title: "Preparing", text: "The culinary team is preparing your dishes." },
  { id: "ready", title: "Ready", text: "Your order is ready for collection." },
  { id: "completed", title: "Completed", text: "Order handed over. Enjoy your dining at Lakowe Lakes!" },
];

export default function OrderTracking() {
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  function refresh() {
    setLastUpdated(new Date());
    window.location.reload();
  }

  const { reference } = useParams<{ reference: string }>();
  const { orders, ready, syncError } = useFnb();
  const order = orders.find((item) => item.reference === reference);

  if (!order) {
    return (
      <FnbShell backHref="/dining/orders" title="Orders">
        <div className="mx-auto max-w-md px-5 py-20 text-center">
          <h1 className="font-serif text-2xl font-bold text-[#172B42]">{!ready ? "Loading your order…" : syncError ? "Unable to load your order" : "Order not found"}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {!ready ? "Checking your saved receipt and order history." : syncError || "No order matches this reference."}
          </p>
          <Link
            href="/dining/orders"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#172B42] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#1E3858]"
          >
            <span>View your orders</span>
          </Link>
        </div>
      </FnbShell>
    );
  }

  const currentIndex = stages.findIndex((stage) => stage.id === order.status);
  const outlet = outlets.find((o) => o.id === order.outletId);

  return (
    <FnbShell backHref="/dining/orders" title="Orders">
      <section className="ll-container max-w-2xl px-4 py-6 sm:py-8">
        {syncError && <p role="status" className="ll-alert mb-4">{syncError}</p>}
        {/* Top Confirmation Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9A6510]">
                  Order Confirmed
                </span>
                <span className="rounded-full bg-[#FFF5DB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9A6510] border border-[#C5A56A]/30">
                  Demo
                </span>
              </div>
              <h1 className="mt-1.5 font-serif text-3xl font-bold text-[#172B42]">
                Thank you.
              </h1>
              <p className="mt-1 font-mono text-xs font-bold text-slate-500">
                {order.reference}
              </p>
            </div>
            <StatusPill status={order.status} />
          </div>

          <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
            {order.paymentMethod === "opera_demo"
              ? "Simulated room charge recorded. No live hotel or financial system is contacted."
              : "Demo payment recorded for this session. No real money has moved."}
          </p>
        </div>

        {/* Compact Pickup Pass (with Slide-Up QR Modal) */}
        <OrderVerificationQr
          verification={order.verification}
          orderStatus={order.status}
        />

        {/* Compact Horizontal Progress Stepper */}
        <section className="mt-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-base font-bold text-[#172B42]">
                Order progress
              </h2>
              <p className="text-[10px] font-medium text-slate-600">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95"
            >
              <svg className="size-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          {/* Stepper Bar */}
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {stages.map((stage, index) => {
                const active = index <= currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <div key={stage.id} className="flex flex-col items-center text-center">
                    <div
                      className={`h-2 w-full rounded-full transition-all duration-300 ${
                        active
                          ? isCurrent
                            ? "bg-emerald-500"
                            : "bg-[#172B42]"
                          : "bg-slate-100"
                      }`}
                    />
                    <span
                      className={`mt-2 block text-[10px] sm:text-[11px] font-bold truncate max-w-full ${
                        isCurrent
                          ? "text-emerald-700 font-extrabold"
                          : active
                          ? "text-[#172B42]"
                          : "text-slate-600"
                      }`}
                    >
                      {stage.title}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Current Active Step Callout */}
            <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-center">
              <p className="text-xs font-semibold text-slate-700">
                {stages[currentIndex]?.text || "Your order is being processed."}
              </p>
            </div>
          </div>
        </section>

        {/* Compact Order Summary Card */}
        <section className="mt-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-serif text-base font-bold text-[#172B42]">
              Order summary
            </h2>
            <span className="text-xs font-bold text-[#9A6510]">
              {outlet?.name}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {order.items.map((line) => {
              const dish = getItem(line.itemId);
              return (
                <div className="flex justify-between gap-3 text-xs sm:text-sm" key={line.key}>
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800">
                      {line.quantity}× {dish?.name}
                    </span>
                    {line.choices.length > 0 && (
                      <p className="text-[11px] text-slate-600">
                        {line.choices.map((c) => c.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                    {money(
                      (dish?.price || 0) * line.quantity +
                        line.choices.reduce((sum, choice) => sum + choice.price * line.quantity, 0)
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total
            </span>
            <span className="font-serif text-lg font-bold text-[#172B42]">
              {money(order.total)}
            </span>
          </div>
        </section>
      </section>
    </FnbShell>
  );
}
