"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { staffSession } from "@/components/staff/StaffShell";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { money } from "@/lib/fnb";
import { Dropdown } from "@/components/ui/Dropdown";
import type { ManagementReport } from "@/lib/management-reporting";

type Session = { id: string; name: string; role: string };
type ReportResponse = { access: { id: string; name: string; role: string; mode: string }; report: ManagementReport };

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Management reporting is unavailable.");
}

function TrendChart({ rows }: { rows: ManagementReport["salesTrend"] }) {
  const width = 760, height = 250, left = 52, right = 18, top = 24, bottom = 42;
  const max = Math.max(...rows.map(row => row.sales), 1);
  const x = (index: number) => rows.length === 1 ? width / 2 : left + index * ((width - left - right) / (rows.length - 1));
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const points = rows.map((row, index) => `${x(index)},${y(row.sales)}`).join(" ");
  const area = rows.length ? `${left},${height - bottom} ${points} ${width - right},${height - bottom}` : "";
  const labels = rows.length <= 7 ? rows : rows.filter((_, index) => index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0);
  if (!rows.length) return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-white/40">No eligible sales in this period.</div>;
  return <div className="overflow-hidden" data-testid="sales-trend"><svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-h-56 w-full" role="img" aria-label="Eligible sales trend">
    <defs><linearGradient id="sales-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d8b874" stopOpacity=".34" /><stop offset="100%" stopColor="#d8b874" stopOpacity="0" /></linearGradient></defs>
    {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - right} y1={top + fraction * (height - top - bottom)} y2={top + fraction * (height - top - bottom)} stroke="rgba(255,255,255,.08)" /><text x={left - 10} y={top + fraction * (height - top - bottom) + 4} textAnchor="end" fill="rgba(255,255,255,.38)" fontSize="10">{new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format((max * (1 - fraction)) / 100)}</text></g>)}
    {rows.length > 1 && <polygon points={area} fill="url(#sales-area)" />}
    {rows.length > 1 && <polyline points={points} fill="none" stroke="#d8b874" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    {rows.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(row.sales)} r="5" fill="#101712" stroke="#e2c783" strokeWidth="3"><title>{row.date}: {money(row.sales)}</title></circle>)}
    {labels.map(row => { const index = rows.indexOf(row); return <text key={row.date} x={x(index)} y={height - 13} textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="10">{new Date(`${row.date}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })}</text>; })}
  </svg></div>;
}

export default function ManagementPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [outlet, setOutlet] = useState("");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const requestVersion = useRef(0); const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string, actorId: string) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/report?${query}`, {
        headers: { "x-demo-user-id": actorId },
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const result: ReportResponse = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setData(result);
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Management reporting is unavailable.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const current = staffSession();
      setSession(current);
      if (current && current.role === "supervisor") void load("", current.id);
      else setLoading(false);
    };
    sync();
    window.addEventListener("lakowe-staff-session-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      activeRequest.current?.abort();
      window.removeEventListener("lakowe-staff-session-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, [load]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (from && to && from > to) { setError("End date cannot be before start date."); return; }
    void load(new URLSearchParams(Object.entries({ from, to, outlet }).filter(([, value]) => value)).toString(), session.id);
  }
  function reset() { setFrom(""); setTo(""); setOutlet(""); if (session) void load("", session.id); }

  const report = data?.report;
  const maxOutlet = Math.max(...(report?.outletTotals.map(row => row.sales) || [1]), 1);
  const maxPayment = Math.max(...(report?.paymentBreakdown.map(row => row.sales) || [1]), 1);
  const period = report ? `${report.filters.from || "All time"} to ${report.filters.to || "Present"}` : "All time";
  const selectedOutlet = report?.availableOutlets.find(item => item.id === report.filters.outlet)?.name || "All outlets";
  const kpis = useMemo(() => report ? [
    { label: "Eligible sales", value: money(report.summary.totalEligibleSales), note: `${report.summary.eligibleTransactions} settled sale${report.summary.eligibleTransactions === 1 ? "" : "s"}`, icon: "₦", definition: report.definitions.totalEligibleSales },
    { label: "Total orders", value: report.summary.totalOrders.toLocaleString(), note: "Created in selected period", icon: "◎", definition: report.definitions.totalOrders },
    { label: "Completed orders", value: report.summary.completedOrders.toLocaleString(), note: "Service status only", icon: "✓", definition: report.definitions.completedOrders },
    { label: "Voided transactions", value: report.summary.voidedTransactions.toLocaleString(), note: "Excluded from eligible sales", icon: "↺", definition: report.definitions.voidedTransactions },
  ] : [], [report]);

  if (!session || session.role !== "supervisor") return <ManagementLoginRequired />;

  return <ManagementShell userName={data?.access.name || session.name}>
    <main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management">
      <header className="flex flex-wrap items-start justify-between gap-5"><div><p className="ll-eyebrow text-[#9A6510]">Executive Summary</p><h1 className="ll-page-title mt-2">Management dashboard</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-700">Live overview of resort food and beverage sales, order completion rates, and revenue by dining outlet.</p></div>{report && <div className="rounded-xl border border-slate-200 bg-white p-4 text-right shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-600">Reporting scope</p><p className="mt-1 text-sm font-bold text-[var(--ll-navy)]">{selectedOutlet}</p><p className="mt-1 text-xs font-semibold text-[#9A6510]">{period}</p></div>}</header>
      <form onSubmit={apply} className="ll-panel mt-7 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr_auto] shadow-xs">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">
          From
          <input aria-label="From date" type="date" value={from} onChange={event => setFrom(event.target.value)} className="ll-input mt-1.5" />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">
          To
          <input aria-label="To date" type="date" value={to} onChange={event => setTo(event.target.value)} className="ll-input mt-1.5" />
        </label>
        <div>
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
            Outlet
          </span>
          <Dropdown
            aria-label="Outlet"
            value={outlet}
            onChange={setOutlet}
            options={[
              { value: "", label: "All outlets" },
              ...(report?.availableOutlets.map(item => ({ value: item.id, label: item.name })) || []),
            ]}
          />
        </div>
        <div className="flex items-end gap-2">
          <button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">
            {loading ? "Loading…" : "Apply"}
          </button>
          <button type="button" onClick={reset} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-bold">
            Reset
          </button>
        </div>
      </form>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">{error}</p>}
      {loading && !report && <div role="status" className="mt-8 grid h-56 place-items-center rounded-2xl border border-white/[.08] bg-[#141f17] text-sm text-white/45">Preparing management report…</div>}
      {report && <div aria-busy={loading}>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(item => <article key={item.label} title={item.definition} className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5 shadow-card"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-white/45">{item.label}</p><p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{item.value}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d4b36e]/10 text-[#e2c783]">{item.icon}</span></div><p className="mt-4 border-t border-white/[.06] pt-3 text-xs text-[#d8b874]">{item.note}</p></article>)}</section>
        {report.summary.excludedAdjustedTransactions > 0 && <p role="alert" className="mt-4 rounded-xl border border-amber-200/20 bg-amber-100/10 px-4 py-3 text-sm text-amber-100">{report.summary.excludedAdjustedTransactions} discounted transaction(s) had unsupported adjustment data and were excluded.</p>}
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_.8fr]"><article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d8b874]">Sales trend</p><h2 className="mt-2 text-xl font-semibold">Eligible POS sales</h2></div><p className="text-xs text-white/40">₦ values · UTC transaction date</p></div><div className="mt-5"><TrendChart rows={report.salesTrend} /></div></article><article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d8b874]">Payment activity</p><h2 className="mt-2 text-xl font-semibold">Payment methods</h2><div className="mt-6 space-y-6">{report.paymentBreakdown.map(row => <div key={row.paymentMethod}><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-xs text-white/40">{row.transactions} eligible transaction(s)</p></div><p className="text-sm font-semibold text-[#e2c783]">{money(row.sales)}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#8d7137] to-[#e2c783]" style={{ width: `${Math.max((row.sales / maxPayment) * 100, 2)}%` }} /></div></div>)}{!report.paymentBreakdown.length && <p className="text-sm text-white/40">No eligible payment activity.</p>}</div></article></section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]"><article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d8b874]">Outlet comparison</p><h2 className="mt-2 text-xl font-semibold">Sales by outlet</h2><div className="mt-6 space-y-5">{report.outletTotals.map(row => <div key={row.outletId}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">{row.outletName}</p><p className="mt-1 text-xs text-white/40">{row.transactions} sale(s)</p></div><p className="text-sm font-semibold">{money(row.sales)}</p></div><div className="mt-3 h-2 rounded-full bg-white/[.06]"><div className="h-2 rounded-full bg-[#d4b36e]" style={{ width: `${row.sales ? Math.max((row.sales / maxOutlet) * 100, 2) : 0}%` }} /></div></div>)}</div></article><article className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#141f17]"><div className="flex items-end justify-between gap-4 p-5 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d8b874]">Payment history</p><h2 className="mt-2 text-xl font-semibold">Recent transactions</h2></div><p className="text-xs text-white/40">Latest 12</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-white/[.07] bg-black/10 text-[10px] uppercase tracking-[.14em] text-white/35"><tr><th className="px-5 py-3">Transaction</th><th>Outlet</th><th>Payment</th><th>Order status</th><th>Payment status</th><th className="pr-5 text-right">Eligible amount</th></tr></thead><tbody>{report.recentTransactions.map(row => <tr key={row.id} className="border-b border-white/[.05] last:border-0"><td className="px-5 py-4"><p className="font-mono text-xs text-[#e2c783]">{row.id}</p><p className="mt-1 font-mono text-[10px] text-white/35">{row.orderReference} · {new Date(row.createdAt).toLocaleString("en-NG")}</p></td><td>{row.outletName}</td><td>{row.paymentLabel}</td><td><span className="capitalize text-white/60">{row.orderStatus}</span></td><td><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${row.transactionStatus === "voided" ? "bg-red-300/10 text-red-200" : row.transactionStatus === "discounted" ? "bg-amber-300/10 text-amber-100" : "bg-emerald-300/10 text-emerald-200"}`}>{row.transactionStatus}</span></td><td className="pr-5 text-right font-semibold">{row.eligibleAmount === null ? "Unsupported" : money(row.eligibleAmount)}</td></tr>)}{!report.recentTransactions.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-white/40">No transactions in this period.</td></tr>}</tbody></table></div></article></section>
        <section className="mt-6 grid gap-4 lg:grid-cols-2"><details className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5"><summary className="cursor-pointer text-sm font-semibold text-[#e2c783]">KPI definitions</summary><dl className="mt-4 space-y-4 text-sm"><div><dt className="font-semibold">Eligible sales</dt><dd className="mt-1 leading-6 text-white/50">{report.definitions.totalEligibleSales}</dd></div><div><dt className="font-semibold">Orders and completion</dt><dd className="mt-1 leading-6 text-white/50">{report.definitions.totalOrders} {report.definitions.completedOrders}</dd></div><div><dt className="font-semibold">Voids</dt><dd className="mt-1 leading-6 text-white/50">{report.definitions.voidedTransactions}</dd></div></dl></details><article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5"><p className="text-sm font-semibold text-[#e2c783]">Coverage and limitations</p><ul className="mt-4 space-y-3 text-sm leading-6 text-white/50">{report.limitations.map(item => <li key={item} className="flex gap-3"><span className="text-[#d8b874]">•</span><span>{item}</span></li>)}</ul></article></section>
        <p className="mt-5 text-right text-[10px] uppercase tracking-[.15em] text-white/25">Generated {new Date(report.generatedAt).toLocaleString("en-NG")}</p>
      </div>}
    </main>
  </ManagementShell>;
}
