"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StaffShell, useStaffSession } from "@/components/staff/StaffShell";
import { getItem, outlets, type DemoOrder, type OrderStatus } from "@/lib/fnb";
type Snapshot = { orders: DemoOrder[] };
const next: Partial<Record<OrderStatus, OrderStatus>> = { received: "preparing", preparing: "ready" };
export default function KitchenPage() {
 const user=useStaffSession(); const [data,setData]=useState<Snapshot|null>(null); const [error,setError]=useState(""); const [busy,setBusy]=useState("");
 const load=useCallback(async()=>{try{const r=await fetch("/api/demo",{cache:"no-store"});if(!r.ok) throw Error("Kitchen queue is unavailable.");setData(await r.json());}catch(e){setError(e instanceof Error?e.message:"Kitchen queue is unavailable.");}},[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer);},[load]);
 const orders=useMemo(()=> (data?.orders||[]).filter(order=>["received","preparing","ready"].includes(order.status)&&!!user&&(user.role==="supervisor"||["clubhouse","winebar"].includes(order.outletId))),[data,user]);
 async function advance(order:DemoOrder){const status=next[order.status];if(!status)return;setBusy(order.reference);setError("");try{const r=await fetch("/api/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"updateOrder",actorId:user?.id,reference:order.reference,status})});const result=await r.json();if(!r.ok)throw Error(result.error||"Order update failed.");setData(result.snapshot);}catch(e){setError(e instanceof Error?e.message:"Order update failed.");}finally{setBusy("");}}
  return (
    <StaffShell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ll-eyebrow text-[#9A6510]">Kitchen display · demo</p>
          <h1 className="ll-page-title mt-2">Preparation queue</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
            Assigned outlets refresh every five seconds. Completion remains in the service queue.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="ll-btn ll-btn-secondary min-h-[42px] px-5 text-xs font-bold shadow-xs hover:bg-slate-100"
        >
          Refresh queue
        </button>
      </header>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-red-300/30 bg-red-50 p-4 text-sm font-bold text-[var(--ll-error)]">
          {error}
        </p>
      )}

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {(["received", "preparing", "ready"] as OrderStatus[]).map((status) => (
          <section key={status} className="ll-panel p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="capitalize text-sm font-bold tracking-wider text-[var(--ll-navy)]">
                {status}
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                {orders.filter((o) => o.status === status).length}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {orders
                .filter((o) => o.status === status)
                .map((order) => (
                  <article key={order.reference} className="rounded-xl border-1.5 border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-bold text-[#9A6510]">{order.reference}</p>
                        <p className="mt-1 text-xs font-bold text-slate-700">
                          {outlets.find((o) => o.id === order.outletId)?.name} ·{" "}
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <Link
                        href={`/staff/orders/${order.reference}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-[#172B42] hover:bg-slate-100 shadow-2xs"
                      >
                        Open
                      </Link>
                    </div>

                    <ul className="mt-4 space-y-2 text-sm text-slate-900 border-t border-slate-100 pt-3">
                      {order.items.map((line) => (
                        <li key={line.key}>
                          <b className="font-bold text-slate-900">{line.quantity}×</b>{" "}
                          <span className="font-semibold text-slate-900">{getItem(line.itemId)?.name || "Menu item"}</span>
                          {line.choices.length ? (
                            <span className="block pl-5 text-xs font-semibold text-slate-700">
                              {line.choices.map((c) => c.name).join(", ")}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>

                    {next[order.status] ? (
                      <button
                        disabled={busy === order.reference}
                        onClick={() => void advance(order)}
                        className="mt-4 w-full rounded-xl bg-[#172B42] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-[#0F2133] disabled:opacity-60 shadow-xs active:scale-95"
                      >
                        {busy === order.reference ? "Updating…" : `Mark ${next[order.status]}`}
                      </button>
                    ) : (
                      <p className="mt-4 text-xs font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                        Ready for service handoff. Open the order to complete it from the authorized service queue.
                      </p>
                    )}
                  </article>
                ))}

              {!orders.some((o) => o.status === status) && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-600">
                  No {status} orders in queue.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </StaffShell>
  );
}
