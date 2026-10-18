"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import { Dropdown } from "@/components/ui/Dropdown";
import { money } from "@/lib/fnb";
import type { OperaMonitoringReport } from "@/lib/opera-monitoring";

type Session = { id: string; name: string; role: string };
type ResponseBody = { access: { id: string; name: string; role: string }; report: OperaMonitoringReport };
type Filters = { from: string; to: string; postingStatus: string; verificationStatus: string; reconciliationState: string; outlet: string; reference: string };
const emptyFilters: Filters = { from: "", to: "", postingStatus: "", verificationStatus: "", reconciliationState: "", outlet: "", reference: "" };
const PAGE_SIZE = 8;
async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "OPERA demo monitoring is unavailable.");
}
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function statusClass(value: string) {
  if (value === "settled" || value === "eligible" || value === "resolved") return "bg-emerald-300/10 text-emerald-200";
  if (value === "uncertain" || value === "pending") return "bg-amber-300/10 text-amber-100";
  if (value === "rejected" || value === "invalid_guest" || value === "invalid_room" || value === "vacant" || value === "charge_disabled") return "bg-red-300/10 text-red-200";
  return "bg-white/[.07] text-white/55";
}

export default function OperaMonitoringPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ResponseBody | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [acting, setActing] = useState("");
  const activeRequest = useRef<AbortController | null>(null); const requestVersion = useRef(0);

  const load = useCallback(async (current: Session, selected: Filters, page = 1) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const query = new URLSearchParams(Object.entries({ ...selected, page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, value]) => value)).toString();
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/opera?${query}`, { headers: { "x-demo-user-id": current.id }, cache: "no-store", signal: controller.signal });
      if (!response.ok) throw await responseError(response);
      const result: ResponseBody = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setData(result);
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "OPERA demo monitoring is unavailable.");
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
  async function reconcile(attemptId: string) {
    if (!session || acting) return;
    setActing(attemptId); setError("");
    try {
      const response = await fetch("/api/management/opera", { method: "POST", headers: { "content-type": "application/json", "x-demo-user-id": session.id }, body: JSON.stringify({ action: "reconcile", attemptId }) });
      if (!response.ok) throw await responseError(response);
      await load(session, filters, data?.report.pagination.page || 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Simulated reconciliation failed."); }
    finally { setActing(""); }
  }

  if (!session) return <ManagementLoginRequired />;
  const report = data?.report;
  return <ManagementShell userName={data?.access.name || session.name}><main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-opera">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="ll-eyebrow text-[#9A6510]">Hotel Room Billing</p>
        <h1 className="ll-page-title mt-2">OPERA room charges</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">Track and reconcile guest dining orders billed directly to hotel rooms and resort chalets.</p>
      </div>
      <span className="ll-status ll-status-warning font-bold">Room Billing Live</span>
    </header>
    <form onSubmit={apply} className="ll-panel mt-7 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 shadow-xs">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Start date<input aria-label="Start date" type="date" value={filters.from} onChange={event => update("from", event.target.value)} className="ll-input mt-1.5" /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">End date<input aria-label="End date" type="date" value={filters.to} onChange={event => update("to", event.target.value)} className="ll-input mt-1.5" /></label>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Posting status</span>
        <Dropdown
          aria-label="Posting status"
          value={filters.postingStatus}
          onChange={val => update("postingStatus", val)}
          options={[
            { value: "", label: "All posting statuses" },
            ...(report?.options.postingStatuses.map(item => ({ value: item.id, label: label(item.label) })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Verification status</span>
        <Dropdown
          aria-label="Verification status"
          value={filters.verificationStatus}
          onChange={val => update("verificationStatus", val)}
          options={[
            { value: "", label: "All verification statuses" },
            ...(report?.options.verificationStatuses.map(item => ({ value: item.id, label: label(item.label) })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Reconciliation</span>
        <Dropdown
          aria-label="Reconciliation state"
          value={filters.reconciliationState}
          onChange={val => update("reconciliationState", val)}
          options={[
            { value: "", label: "All reconciliation states" },
            ...(report?.options.reconciliationStates.map(item => ({ value: item.id, label: label(item.label) })) || []),
          ]}
        />
      </div>
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
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Order, posting or transaction reference<input aria-label="Reference search" value={filters.reference} onChange={event => update("reference", event.target.value)} placeholder="LL-…, OPR-DEMO-… or TXN-…" className="ll-input mt-1.5" /></label>
      <div className="flex items-end gap-2"><button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">{loading ? "Loading…" : "Apply filters"}</button><button type="button" onClick={clear} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-semibold">Clear</button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--ll-error)]">{error}</p>}
    {loading && !report && <div role="status" className="ll-panel-muted mt-6 grid h-52 place-items-center text-sm font-semibold text-slate-600">Loading simulated posting attempts…</div>}
    {report && <section aria-busy={loading} className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[["Attempts", report.summary.total], ["Settled", report.summary.settled], ["Rejected", report.summary.rejected], ["Unavailable", report.summary.unavailable], ["Uncertain", report.summary.uncertain], ["Pending reconciliation", report.summary.pendingReconciliation]].map(([name, count]) => <article key={String(name)} className="ll-panel p-4 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-600">{name}</p><p className="ll-amount mt-2 text-2xl font-bold text-[var(--ll-navy)]">{count}</p></article>)}</div>
      <div className="mt-5 space-y-4">{report.attempts.map(attempt => <article data-testid="opera-attempt" key={attempt.id} className="ll-panel overflow-hidden shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5"><div><p className="font-mono text-xs font-bold text-[#9A6510]">{attempt.orderReference}</p><h2 className="mt-2 text-lg font-bold text-[var(--ll-navy)]">{attempt.outletName} · {money(attempt.amount)}</h2><p className="mt-1 text-xs font-medium text-slate-600">{attempt.roomReferenceMasked} · {attempt.guestNameMasked} · {new Date(attempt.attemptTimestamp).toLocaleString("en-NG")}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass(attempt.verificationStatus)}`}>{label(attempt.verificationStatus)}</span><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass(attempt.postingStatus)}`}>{label(attempt.postingStatus)}</span></div></div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Posting reference</p><p className="mt-2 break-all font-mono text-xs font-bold text-slate-800">{attempt.postingReference || "Unavailable"}</p></div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">POS transaction</p><p className="mt-2 break-all font-mono text-xs font-bold text-slate-800">{attempt.linkedTransactionId || "Not created"}</p></div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Reconciliation</p><p className="mt-2 text-sm font-bold capitalize text-slate-800">{label(attempt.reconciliationState)}</p><p className="mt-1 text-xs font-medium text-slate-500">Retry: {attempt.canRetry ? "Available" : "Not exposed"}</p></div><div className="bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Last checked</p><p className="mt-2 text-xs font-medium text-slate-700">{attempt.lastCheckedAt ? new Date(attempt.lastCheckedAt).toLocaleString("en-NG") : "Unavailable"}</p></div></div>
        {attempt.failureReason && <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-900"><b>Result:</b> {attempt.failureReason}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 bg-slate-50"><details><summary className="cursor-pointer text-xs font-bold text-[#9A6510]">{attempt.audits.length} related audit event{attempt.audits.length === 1 ? "" : "s"}</summary><div className="mt-3 space-y-2">{attempt.audits.map(event => <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700"><b className="font-bold text-slate-900">{event.action}</b> · {event.actorName} ({event.actorRole}) · {new Date(event.timestamp).toLocaleString("en-NG")}</div>)}</div></details>{attempt.canReconcile && <button disabled={Boolean(acting)} onClick={() => void reconcile(attempt.id)} className="ll-btn ll-btn-primary min-h-[40px] px-4 text-xs font-bold disabled:opacity-50">{acting === attempt.id ? "Reconciling…" : "Retrieve posting result"}</button>}</div>
      </article>)}{!report.attempts.length && <p className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm font-medium text-slate-600">No simulated OPERA attempts match these filters.</p>}</div>
      <div className="ll-panel mt-5 flex items-center justify-between p-3 shadow-xs"><button disabled={loading || report.pagination.page <= 1} onClick={() => session && void load(session, filters, report.pagination.page - 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Previous</button><span className="text-xs font-semibold text-slate-600">{report.pagination.totalItems} total · page {report.pagination.page} of {report.pagination.totalPages}</span><button disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => session && void load(session, filters, report.pagination.page + 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Next</button></div>
      <article className="ll-panel mt-5 p-5 shadow-xs"><p className="text-sm font-bold text-[var(--ll-navy)]">Simulation boundaries</p><ul className="mt-3 space-y-2 text-sm leading-6 font-medium text-slate-700">{report.limitations.map(item => <li key={item}>• {item}</li>)}</ul></article>
    </section>}
  </main></ManagementShell>;
}
