/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StaffShell, useStaffSession } from "@/components/staff/StaffShell";
import { money, outlets } from "@/lib/fnb";
import { StatusPill } from "@/components/fnb/FnbShell";
import { Dropdown } from "@/components/ui/Dropdown";

export default function StaffDashboard() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const user = useStaffSession();

  useEffect(() => {
    const load = () =>
      fetch("/api/demo", { cache: "no-store" })
        .then((r) => r.json())
        .then(setData);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const orders = useMemo(
    () =>
      (data?.orders || []).filter(
        (o: any) =>
          (!user || user.role === "supervisor" || (user.outlets || ["clubhouse", "winebar"]).includes(o.outletId)) &&
          (filter === "all" || o.outletId === filter)
      ),
    [data, filter, user]
  );

  const statuses = ["received", "preparing", "ready", "completed"];

  const outletOptions = [
    { value: "all", label: "All assigned outlets" },
    ...outlets.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <StaffShell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ll-eyebrow text-[#9A6510]">Operational workspace</p>
          <h1 className="ll-page-title mt-2">Work queue</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
            Active orders refresh automatically every five seconds.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Link href="/staff/verify" className="ll-btn ll-btn-primary min-h-[46px] shadow-xs">
            Scan / Verify handoff
          </Link>
          <div className="w-full sm:w-auto min-w-[220px]">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
              Outlet
            </span>
            <Dropdown
              aria-label="Filter outlet"
              value={filter}
              onChange={setFilter}
              options={outletOptions}
            />
          </div>
        </div>
      </header>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statuses.map((s) => (
          <article key={s} className="ll-panel p-4">
            <p className="ll-eyebrow">{s === "completed" ? "Completed / Received" : s}</p>
            <p className="ll-amount mt-2 text-3xl font-bold text-[var(--ll-navy)]">
              {orders.filter((o: any) => o.status === s).length}
            </p>
          </article>
        ))}
      </div>

      <section className="mt-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((o: any) => (
            <article key={o.reference} className="ll-panel p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-[var(--ll-muted)]">{o.reference}</p>
                    <h2 className="mt-1 font-bold text-[var(--ll-navy)]">{outlets.find((x) => x.id === o.outletId)?.name}</h2>
                    <p className="mt-1 text-sm text-[var(--ll-muted)]">
                      {o.items.reduce((n: number, i: any) => n + i.quantity, 0)} item(s) · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {o.customerName && <p className="mt-1 text-xs text-[var(--ll-slate)]">Guest: {o.customerName}</p>}
                  </div>
                  <StatusPill status={o.status} />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="ll-amount font-bold text-[var(--ll-navy)]">{money(o.total)}</span>
                <div className="flex gap-2">
                  {o.status === "ready" && (
                    <Link href={`/staff/verify?order=${o.reference}`} className="ll-btn bg-emerald-700 text-white hover:bg-emerald-800 text-xs py-1.5 px-3">
                      Verify
                    </Link>
                  )}
                  <Link href={"/staff/orders/" + o.reference} className="ll-btn ll-btn-secondary text-xs py-1.5 px-3">
                    Open order
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!orders.length && <div className="ll-panel-muted p-10 text-center text-sm text-[var(--ll-muted)]">No orders for this outlet.</div>}
      </section>
    </StaffShell>
  );
}