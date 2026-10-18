"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import { Dropdown } from "@/components/ui/Dropdown";
import { money } from "@/lib/fnb";
import type { SageMonitoringReport } from "@/lib/sage-monitoring";

type Session = { id: string; name: string; role: string };
type ResponseBody = { access: { id: string; name: string; role: string }; report: SageMonitoringReport };
type Filters = { from: string; to: string; outlet: string; syncStatus: string; paymentMethod: string; reference: string };
const emptyFilters: Filters = { from: "", to: "", outlet: "", syncStatus: "", paymentMethod: "", reference: "" };
const PAGE_SIZE = 8;
async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Sage demo monitoring is unavailable.");
}
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function statusClass(value: string) {
  if (value === "posted") return "bg-emerald-300/10 text-emerald-200";
  if (value === "uncertain" || value === "queued") return "bg-amber-300/10 text-amber-100";
  if (value === "rejected" || value === "transmission_failed") return "bg-red-300/10 text-red-200";
  return "bg-white/[.07] text-white/55";
}

export default function SageMonitoringPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ResponseBody | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [scenarioByTransaction, setScenarioByTransaction] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [acting, setActing] = useState(""); const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null); const requestVersion = useRef(0);

  const load = useCallback(async (current: Session, selected: Filters, page = 1) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const query = new URLSearchParams(Object.entries({ ...selected, page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, value]) => value)).toString();
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/sage?${query}`, { headers: { "x-demo-user-id": current.id }, cache: "no-store", signal: controller.signal });
      if (!response.ok) throw await responseError(response);
      const result: ResponseBody = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setData(result);
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Sage demo monitoring is unavailable.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const current = staffSession(); setSession(current);
    if (current) void load(current, emptyFilters); else setLoading(false);
    return () => activeRequest.current?.abort();
  }, [load]);
  function update(name: keyof Filters, value: string) { setFilters(current => ({ ...current, [name]: value })); }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (filters.from && filters.to && filters.from > filters.to) { setError("End date cannot be before start date."); return; }
    void load(session, filters);
  }
  function clear() { setFilters(emptyFilters); if (session) void load(session, emptyFilters); }
  async function action(body: Record<string, string>, key: string) {
    if (!session || acting) return;
    setActing(key); setError("");
    try {
      const response = await fetch("/api/management/sage", { method: "POST", headers: { "content-type": "application/json", "x-demo-user-id": session.id }, body: JSON.stringify(body) });
      if (!response.ok) throw await responseError(response);
      await load(session, filters, data?.report.pagination.page || 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sage demo action failed."); }
    finally { setActing(""); }
  }

  if (!session) return <ManagementLoginRequired />;
  const report = data?.report;
  return <ManagementShell userName={data?.access.name || session.name}><main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-sage">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="ll-eyebrow text-[#9A6510]">Financial Synchronization</p>
        <h1 className="ll-page-title mt-2">Sage 200 accounting</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">Sync daily dining revenue, payment journals, and general ledger postings with Sage accounting.</p>
      </div>
      <span className="ll-status ll-status-warning font-bold">Accounting Sync Live</span>
    </header>
    <form onSubmit={apply} className="ll-panel mt-7 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 shadow-xs">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Start date<input aria-label="Start date" type="date" value={filters.from} onChange={event => update("from", event.target.value)} className="ll-input mt-1.5" /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">End date<input aria-label="End date" type="date" value={filters.to} onChange={event => update("to", event.target.value)} className="ll-input mt-1.5" /></label>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Outlet</span>
        <Dropdown
          aria-label="Outlet"
          value={filters.outlet}
          onChange={val => update("outlet", val)}
          options={[
            { value: "", label: "All outlets" },
            ...(report?.options.outlets.map(item => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Synchronization status</span>
        <Dropdown
          aria-label="Synchronization status"
          value={filters.syncStatus}
          onChange={val => update("syncStatus", val)}
          options={[
            { value: "", label: "All statuses" },
            ...(report?.options.syncStatuses.map(item => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Payment method</span>
        <Dropdown
          aria-label="Payment method"
          value={filters.paymentMethod}
          onChange={val => update("paymentMethod", val)}
          options={[
            { value: "", label: "All payment mappings" },
            ...(report?.options.paymentMethods.map(item => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 sm:col-span-2">Transaction, order, sync or posting reference<input aria-label="Reference search" value={filters.reference} onChange={event => update("reference", event.target.value)} placeholder="TXN-…, LL-…, SAGESYNC-… or SAGE-DEMO-…" className="ll-input mt-1.5" /></label>
      <div className="flex items-end gap-2"><button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">{loading ? "Loading…" : "Apply filters"}</button><button type="button" onClick={clear} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-semibold">Clear</button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--ll-error)]">{error}</p>}
    {loading && !report && <div role="status" className="ll-panel-muted mt-6 grid h-52 place-items-center text-sm font-semibold text-slate-600">Loading accounting synchronization…</div>}
    {report && <section aria-busy={loading} className="mt-6">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"><b>{report.mapping.version}:</b> {report.mapping.disclaimer}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{[["Eligible", report.summary.eligibleUnsynchronized], ["Records", report.summary.total], ["Queued", report.summary.queued], ["Posted", report.summary.posted], ["Rejected", report.summary.rejected], ["Transmission failed", report.summary.transmissionFailed], ["Uncertain", report.summary.uncertain]].map(([name, count]) => <article key={String(name)} className="ll-panel p-4 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-600">{name}</p><p className="ll-amount mt-2 text-2xl font-bold text-[var(--ll-navy)]">{count}</p></article>)}</div>
      <article className="ll-panel mt-5 overflow-hidden shadow-xs"><div className="p-5 border-b border-slate-200"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#9A6510]">Eligible source transactions</p><h2 className="mt-2 text-xl font-bold text-[var(--ll-navy)]">{report.candidates.length} unsynchronized candidate{report.candidates.length === 1 ? "" : "s"}</h2><p className="mt-1 text-sm font-medium text-slate-600">Wallet deposits and unconfirmed OPERA attempts are not POS transaction candidates.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wider text-slate-700 font-bold"><tr><th className="px-4 py-3">Transaction</th><th>Outlet</th><th>Payment</th><th>Status</th><th>Eligible</th><th>Discount</th><th>Void reversal</th><th>Scenario</th><th /></tr></thead><tbody>{report.candidates.map(candidate => <tr data-testid="sage-candidate" key={candidate.transactionId} className="border-b border-slate-100 hover:bg-slate-50/50"><td className="px-4 py-3"><p className="font-mono font-bold text-[#9A6510]">{candidate.transactionId}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{candidate.orderReference}</p></td><td className="font-medium text-slate-800">{candidate.outletName}</td><td className="font-medium text-slate-800">{label(candidate.paymentMethod)}</td><td className="capitalize font-semibold text-slate-800">{label(candidate.sourceStatus)}</td><td className="ll-amount font-bold text-slate-900">{money(candidate.eligibleAmount)}</td><td className="ll-amount font-medium text-slate-700">{money(candidate.discountAmount)}</td><td className="ll-amount font-medium text-slate-700">{money(candidate.reversalAmount)}</td><td className="w-44 py-1.5"><Dropdown aria-label={`Scenario for ${candidate.transactionId}`} value={scenarioByTransaction[candidate.transactionId] || "success"} onChange={val => setScenarioByTransaction(current => ({ ...current, [candidate.transactionId]: val }))} options={report.options.scenarios.map(item => ({ value: item.id, label: item.label }))} buttonClassName="!min-h-[36px] !py-1 !px-2.5 !text-xs" /></td><td className="pr-4"><button disabled={Boolean(acting)} onClick={() => void action({ action: "prepare", transactionId: candidate.transactionId, scenario: scenarioByTransaction[candidate.transactionId] || "success" }, candidate.transactionId)} className="ll-btn ll-btn-secondary min-h-[36px] px-3 text-xs font-bold disabled:opacity-40">{acting === candidate.transactionId ? "Preparing…" : "Prepare"}</button></td></tr>)}{!report.candidates.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm font-medium text-slate-600">No unsynchronized eligible transactions match these filters.</td></tr>}</tbody></table></div></article>
      <div className="mt-5 space-y-4">{report.records.map(record => <article data-testid="sage-sync" key={record.id} className="ll-panel overflow-hidden shadow-xs"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5"><div><p className="font-mono text-xs font-bold text-[#9A6510]">{record.sourceTransactionId}</p><h2 className="mt-2 text-lg font-bold text-[var(--ll-navy)]">{record.outletName} · {money(record.eligibleAmount || record.reversalAmount)}</h2><p className="mt-1 font-mono text-[11px] font-medium text-slate-500">{record.sourceOrderReference} · {record.id}</p></div><div className="flex gap-2"><span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">POS: {label(record.sourceTransactionStatus)}</span><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass(record.syncStatus)}`}>Sage: {label(record.syncStatus)}</span></div></div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Accounting categories</p><p className="mt-2 text-xs font-bold text-slate-800">{record.postingCategory}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{record.revenueCategory}<br />{record.offsetCategory}</p></div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Posting reference</p><p className="mt-2 break-all font-mono text-xs font-bold text-slate-800">{record.postingReference || "Unavailable"}</p></div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Amounts</p><p className="mt-2 text-xs font-semibold text-slate-800">Gross {money(record.grossAmount)} · Net {money(record.eligibleAmount)}</p><p className="mt-1 text-[10px] font-medium text-slate-500">Discount {money(record.discountAmount)} · Reversal {money(record.reversalAmount)}</p>{record.reversalReference && <p className="mt-1 break-all font-mono text-[10px] text-slate-500">Reversal reference: {record.reversalReference}</p>}</div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Attempts / reconciliation</p><p className="mt-2 text-xs font-semibold text-slate-800">{record.attemptCount} attempt(s) · {label(record.reconciliationState)}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{record.lastAttemptAt ? new Date(record.lastAttemptAt).toLocaleString("en-NG") : "Not submitted"}</p></div></div>
        {record.failureReason && <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-900"><b>Result:</b> {record.failureReason}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 bg-slate-50"><details><summary className="cursor-pointer text-xs font-bold text-[#9A6510]">{record.audits.length} related audit event{record.audits.length === 1 ? "" : "s"}</summary><div className="mt-3 space-y-2">{record.audits.map(event => <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700"><b className="font-bold text-slate-900">{event.action}</b> · {event.actorName} ({event.actorRole}) · {new Date(event.timestamp).toLocaleString("en-NG")}</div>)}</div></details><div className="flex gap-2">{record.canSubmit && <button disabled={Boolean(acting)} onClick={() => void action({ action: "submit", syncId: record.id }, record.id)} className="ll-btn ll-btn-primary min-h-[40px] px-4 text-xs font-bold">{acting === record.id ? "Submitting…" : "Submit DEMO record"}</button>}{record.canRetry && <button disabled={Boolean(acting)} onClick={() => void action({ action: "submit", syncId: record.id }, record.id)} className="ll-btn ll-btn-secondary min-h-[40px] px-4 text-xs font-bold text-amber-700 border-amber-300">{acting === record.id ? "Retrying…" : "Retry safe transmission"}</button>}{record.canReconcile && <button disabled={Boolean(acting)} onClick={() => void action({ action: "reconcile", syncId: record.id }, record.id)} className="ll-btn ll-btn-secondary min-h-[40px] px-4 text-xs font-bold">{acting === record.id ? "Reconciling…" : "Retrieve posting status"}</button>}</div></div>
      </article>)}{!report.records.length && <p className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm font-medium text-slate-600">No Sage synchronization records match these filters.</p>}</div>
      <div className="ll-panel mt-5 flex items-center justify-between p-3 shadow-xs"><button disabled={loading || report.pagination.page <= 1} onClick={() => session && void load(session, filters, report.pagination.page - 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Previous</button><span className="text-xs font-semibold text-slate-600">{report.pagination.totalItems} total · page {report.pagination.page} of {report.pagination.totalPages}</span><button disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => session && void load(session, filters, report.pagination.page + 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Next</button></div>
      <article className="ll-panel mt-5 p-5 shadow-xs"><p className="text-sm font-bold text-[var(--ll-navy)]">Simulation boundaries</p><ul className="mt-3 space-y-2 text-sm leading-6 font-medium text-slate-700">{report.limitations.map(item => <li key={item}>• {item}</li>)}</ul></article>
    </section>}
  </main></ManagementShell>;
}
