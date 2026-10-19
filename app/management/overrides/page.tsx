"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import type { OverrideReport } from "@/lib/audit-reporting";
import { money } from "@/lib/fnb";
import { Dropdown } from "@/components/ui/Dropdown";

type Session = { id: string; name: string; role: string };
type ResponseBody = { access: { id: string; name: string; role: string }; report: OverrideReport };
type Filters = { from: string; to: string; employee: string; status: string; action: string; outlet: string; reference: string };
const PAGE_SIZE = 6;
const emptyFilters: Filters = { from: "", to: "", employee: "", status: "", action: "", outlet: "", reference: "" };

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Override reporting is unavailable.");
}
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function json(value: unknown) { return value === null || value === undefined ? "Unavailable" : typeof value === "string" ? value : JSON.stringify(value, null, 2); }

export default function ManagementOverridesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ResponseBody | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null); const requestVersion = useRef(0);

  const load = useCallback(async (currentSession: Session, page: number, selected: Filters) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const query = new URLSearchParams(Object.entries({ ...selected, page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, value]) => value)).toString();
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/overrides?${query}`, {
        headers: { "x-demo-user-id": currentSession.id },
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const result: ResponseBody = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setData(result);
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Override reporting is unavailable.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference") || "";
    const initial = { ...emptyFilters, reference };
    setFilters(initial);
    const sync = () => {
      const current = staffSession();
      setSession(current);
      if (current && current.role === "supervisor") void load(current, 1, initial);
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

  function update(name: keyof Filters, value: string) { setFilters(current => ({ ...current, [name]: value })); }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (filters.from && filters.to && filters.from > filters.to) { setError("End date cannot be before start date."); return; }
    void load(session, 1, filters);
  }
  function clear() { setFilters(emptyFilters); if (session) void load(session, 1, emptyFilters); }

  if (!session || session.role !== "supervisor") return <ManagementLoginRequired />;
  const report = data?.report;
  return <ManagementShell userName={data?.access.name || session.name}><main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-overrides">
    <header>
      <p className="ll-eyebrow text-[#9A6510]">Supervisor Approvals</p>
      <h1 className="ll-page-title mt-2">Price overrides & voids</h1>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">Review and audit discount requests, item voids, and manager approvals with staff justifications.</p>
    </header>
    <form onSubmit={apply} className="ll-panel mt-7 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 shadow-xs">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Start date<input aria-label="Start date" type="date" value={filters.from} onChange={event => update("from", event.target.value)} className="ll-input mt-1.5" /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">End date<input aria-label="End date" type="date" value={filters.to} onChange={event => update("to", event.target.value)} className="ll-input mt-1.5" /></label>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Requesting employee</span>
        <Dropdown
          aria-label="Requesting employee"
          value={filters.employee}
          onChange={(val) => update("employee", val)}
          options={[
            { value: "", label: "All requesters" },
            ...(report?.options.employees.map((item) => ({ value: item.id, label: `${item.label} · ${item.role}` })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Status</span>
        <Dropdown
          aria-label="Override status"
          value={filters.status}
          onChange={(val) => update("status", val)}
          options={[
            { value: "", label: "All statuses" },
            ...(report?.options.statuses.map((item) => ({ value: item, label: label(item) })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Requested action</span>
        <Dropdown
          aria-label="Requested action"
          value={filters.action}
          onChange={(val) => update("action", val)}
          options={[
            { value: "", label: "All actions" },
            ...(report?.options.actions.map((item) => ({ value: item, label: label(item) })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Outlet</span>
        <Dropdown
          aria-label="Outlet"
          value={filters.outlet}
          onChange={(val) => update("outlet", val)}
          options={[
            { value: "", label: "All outlets" },
            ...(report?.options.outlets.map((item) => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Request, transaction or order reference<input aria-label="Reference search" value={filters.reference} onChange={event => update("reference", event.target.value)} placeholder="OVR-…, TXN-… or LL-…" className="ll-input mt-1.5" /></label>
      <div className="flex items-end gap-2"><button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">{loading ? "Loading…" : "Apply filters"}</button><button type="button" onClick={clear} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-semibold">Clear</button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--ll-error)]">{error}</p>}
    {loading && !report && <div role="status" className="ll-panel-muted mt-6 grid h-52 place-items-center text-sm font-semibold text-slate-600">Loading override history…</div>}
    {report && <section aria-busy={loading} className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Total requests", report.summary.total], ["Pending", report.summary.pending], ["Approved", report.summary.approved], ["Rejected", report.summary.rejected]].map(([name, value]) => <article key={String(name)} className="ll-panel p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-600">{name}</p><p className="ll-amount mt-3 text-3xl font-bold text-[var(--ll-navy)]">{value}</p></article>)}</div>
      <div className="mt-6 space-y-5">{report.overrides.map(item => <article data-testid="override-card" key={item.id} className="ll-panel overflow-hidden shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5"><div><p className="font-mono text-xs font-bold text-[#9A6510]">{item.id}</p><h2 className="mt-2 text-xl font-bold text-[var(--ll-navy)]">{label(item.requestedAction)} request</h2><p className="mt-1 text-sm font-medium text-slate-600">{item.outletName} · requested {new Date(item.requestedAt).toLocaleString("en-NG")}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${item.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : item.status === "rejected" ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>{item.status}</span></div>
        <div className="grid gap-px bg-slate-200 lg:grid-cols-4"><div className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">1 · Original transaction</p><p className="mt-3 font-mono text-xs font-bold text-[#9A6510]">{item.transactionId}</p><p className="mt-1 font-mono text-[11px] font-medium text-slate-500">{item.orderReference}</p><p className="ll-amount mt-4 text-2xl font-bold text-[var(--ll-navy)]">{money(item.originalAmount)}</p><p className="mt-1 text-xs font-semibold capitalize text-slate-600">Current status: {item.transactionStatus}</p></div>
          <div className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">2 · Staff request</p><p className="mt-3 font-bold text-[var(--ll-navy)]">{item.requesterName}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#9A6510]">{item.requesterRole}</p><p className="mt-3 text-sm font-medium leading-6 text-slate-700">{item.requestReason}</p><p className="mt-3 text-xs font-semibold text-slate-600">Proposed {item.requestedAction === "discount" ? "discount" : "value"}: <span className="font-bold text-slate-900">{item.proposedAmount === null ? "Unavailable" : money(item.proposedAmount)}</span></p>{item.proposedNetAmount !== null && <p className="mt-1 text-xs font-semibold text-slate-600">Proposed net sale: <span className="font-bold text-slate-900">{money(item.proposedNetAmount)}</span></p>}</div>
          <div className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">3 · Supervisor decision</p><p className="mt-3 font-bold text-[var(--ll-navy)]">{item.decidingSupervisorName || "Unavailable"}</p><p className="mt-1 text-xs font-semibold text-slate-500">Assigned supervisor: Unavailable, not recorded</p><p className="mt-3 text-sm font-medium leading-6 text-slate-700">{item.decisionReason || "Decision reason unavailable"}</p><p className="mt-3 text-xs font-semibold text-slate-600">{item.decidedAt ? new Date(item.decidedAt).toLocaleString("en-NG") : "Decision timestamp unavailable"}</p></div>
          <div className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">4 · Resulting adjustment</p><p className="mt-3 text-sm font-bold text-slate-900">{item.adjustmentAppliedFromThisRequest ? "Applied from this request" : item.status === "rejected" ? "No adjustment applied" : "Not recorded"}</p><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium leading-5 text-slate-700">{json(item.appliedAdjustment)}</pre><div className="mt-4 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 font-bold text-slate-700">Request audit × {item.integrity.requestAuditCount}</span><span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 font-bold text-slate-700">Decision audit × {item.integrity.decisionAuditCount}</span><span className={`rounded-full px-2 py-1 font-bold ${item.integrity.duplicateSuccessfulAdjustments ? "border border-red-200 bg-red-50 text-red-700" : "border border-slate-200 bg-slate-100 text-slate-700"}`}>Adjustment audit × {item.integrity.adjustmentAuditCount}</span></div></div></div>
        <details className="border-t border-slate-200 p-5 bg-slate-50"><summary className="cursor-pointer text-sm font-bold text-[#9A6510]">{item.relatedAuditEvents.length} related audit event{item.relatedAuditEvents.length === 1 ? "" : "s"}</summary><div className="mt-4 space-y-3">{item.relatedAuditEvents.map(event => <div key={event.id} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:grid-cols-[180px_1fr_auto]"><div><p className="font-bold text-[#9A6510]">{event.action}</p><p className="mt-1 font-mono text-[10px] font-medium text-slate-500">{event.id}</p></div><p className="font-medium text-slate-700">{event.actorName} · {event.actorRole}<br /><span className="font-mono text-[10px] text-slate-500">{event.entityType}: {event.entityId}</span></p><time className="text-xs font-semibold text-slate-600">{new Date(event.timestamp).toLocaleString("en-NG")}</time>{(event.beforeValue !== null || event.afterValue !== null) && <pre className="whitespace-pre-wrap break-words text-[10px] text-slate-600 sm:col-span-3">{json({ before: event.beforeValue, after: event.afterValue })}</pre>}</div>)}</div></details>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><p className="text-xs font-medium text-slate-600">Request → decision → adjustment linked by <span className="font-mono font-bold text-slate-800">{item.id}</span></p><Link href={`/management/audit?reference=${encodeURIComponent(item.id)}`} className="text-xs font-bold text-[#9A6510] hover:underline underline-offset-4">Open linked audit events</Link></div>
      </article>)}{!report.overrides.length && <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-medium text-slate-600">No override requests match these filters.</p>}</div>
      <div className="ll-panel mt-5 flex items-center justify-between p-3 shadow-xs"><button disabled={loading || report.pagination.page <= 1} onClick={() => session && void load(session, report.pagination.page - 1, filters)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Previous</button><span className="text-xs font-semibold text-slate-600">{report.pagination.totalItems} total · page {report.pagination.page} of {report.pagination.totalPages}</span><button disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => session && void load(session, report.pagination.page + 1, filters)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Next</button></div>
      <article className="ll-panel mt-5 p-5 shadow-xs"><p className="text-sm font-bold text-[var(--ll-navy)]">Coverage and limitations</p><ul className="mt-3 space-y-2 text-sm leading-6 font-medium text-slate-700">{report.limitations.map(item => <li key={item}>• {item}</li>)}</ul></article>
    </section>}
  </main></ManagementShell>;
}
