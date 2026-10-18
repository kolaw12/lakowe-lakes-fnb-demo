"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import type { AuditReport } from "@/lib/audit-reporting";
import { money } from "@/lib/fnb";
import { Dropdown } from "@/components/ui/Dropdown";

type Session = { id: string; name: string; role: string };
type ResponseBody = { access: { id: string; name: string; role: string }; report: AuditReport };
const PAGE_SIZE = 8;

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Audit reporting is unavailable.");
}
const HUMAN_ACTION_LABELS: Record<string, string> = {
  "sage.sync.posting_result": "Sage 200 Accounting Sync",
  "sage.sync.posting_attempt": "Posting to Sage 200",
  "sage.sync.prepared": "Sage Ledger Prepared",
  "sage.sync.source_identified": "Transaction Recorded for Accounting",
  "sage.sync.reconciliation_requested": "Accounting Reconciliation Requested",
  "sage.sync.reconciled": "Accounting Record Reconciled",
  "opera.room_charge.posting_result": "Room Charge Posted (OPERA)",
  "opera.room_charge.initiated": "Room Charge Requested",
  "opera.room_charge.verification": "Guest Room Verified",
  "opera.room_charge.posting_attempt": "Sending Charge to Room",
  "opera.room_charge.reconciliation_requested": "Room Charge Reconciliation Requested",
  "opera.room_charge.reconciled": "Room Charge Reconciled",
  "order.created": "New Order Placed",
  "order.status_changed": "Order Status Updated",
  "order.handoff_completed": "Order Delivered to Guest",
  "order.handoff_exception": "Order Delivery Exception",
  "order_verification.reissued": "Guest Pass Reissued",
  "order_verification.revoked": "Guest Pass Revoked",
  "override.requested": "Manager Discount / Void Requested",
  "transaction.adjusted": "Transaction Adjusted by Supervisor",
  "menu.availability_changed": "Menu Availability Changed",
  "wallet.deposit": "Wallet Balance Added",
  "wallet.purchase": "Paid with Wallet",
};

function actionLabel(value: string) {
  if (HUMAN_ACTION_LABELS[value]) return HUMAN_ACTION_LABELS[value];
  return value
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" · ");
}
function detailValue(value: unknown) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
function proposedAmount(details: Record<string, unknown> | null) {
  return details && typeof details.proposedAmount === "number" ? money(details.proposedAmount) : "Unavailable";
}

export default function ManagementAuditPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [employee, setEmployee] = useState("");
  const [action, setAction] = useState(""); const [outlet, setOutlet] = useState(""); const [reference, setReference] = useState("");
  const activeRequest = useRef<AbortController | null>(null); const requestVersion = useRef(0);

  const load = useCallback(async (currentSession: Session, page: number, selected: { from: string; to: string; employee: string; action: string; outlet: string; reference: string }) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const query = new URLSearchParams(Object.entries({ ...selected, page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, value]) => value)).toString();
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/audit?${query}`, { headers: { "x-demo-user-id": currentSession.id }, cache: "no-store", signal: controller.signal });
      if (!response.ok) throw await responseError(response);
      const result: ResponseBody = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setData(result);
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Audit reporting is unavailable.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const current = staffSession(); setSession(current);
    const initialReference = new URLSearchParams(window.location.search).get("reference") || "";
    setReference(initialReference);
    if (current) void load(current, 1, { from: "", to: "", employee: "", action: "", outlet: "", reference: initialReference }); else setLoading(false);
    return () => activeRequest.current?.abort();
  }, [load]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (from && to && from > to) { setError("End date cannot be before start date."); return; }
    void load(session, 1, { from, to, employee, action, outlet, reference });
  }
  function clear() {
    const empty = { from: "", to: "", employee: "", action: "", outlet: "", reference: "" };
    setFrom(""); setTo(""); setEmployee(""); setAction(""); setOutlet(""); setReference("");
    if (session) void load(session, 1, empty);
  }

  if (!session) return <ManagementLoginRequired />;
  const report = data?.report;
  return <ManagementShell userName={data?.access.name || session.name}><main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-audit">
    <header>
      <p className="ll-eyebrow text-[#9A6510]">System & Staff History</p>
      <h1 className="ll-page-title mt-2">Activity log</h1>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">A clear, real-time timeline of all dining orders, staff actions, manager approvals, and payment updates.</p>
    </header>
    <form onSubmit={apply} className="ll-panel mt-7 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 shadow-xs">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Start date<input aria-label="Start date" type="date" value={from} onChange={event => setFrom(event.target.value)} className="ll-input mt-1.5" /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">End date<input aria-label="End date" type="date" value={to} onChange={event => setTo(event.target.value)} className="ll-input mt-1.5" /></label>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Employee</span>
        <Dropdown
          aria-label="Employee"
          value={employee}
          onChange={setEmployee}
          options={[
            { value: "", label: "All employees" },
            ...(report?.options.employees.map((item) => ({ value: item.id, label: `${item.label} · ${item.role}` })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Action</span>
        <Dropdown
          aria-label="Action type"
          value={action}
          onChange={setAction}
          options={[
            { value: "", label: "All actions" },
            ...(report?.options.actions.map((item) => ({ value: item, label: actionLabel(item) })) || []),
          ]}
        />
      </div>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Outlet</span>
        <Dropdown
          aria-label="Outlet"
          value={outlet}
          onChange={setOutlet}
          options={[
            { value: "", label: "All outlets" },
            ...(report?.options.outlets.map((item) => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 sm:col-span-2">Search by reference<input aria-label="Reference search" value={reference} onChange={event => setReference(event.target.value)} placeholder="e.g. Order # or Reference" className="ll-input mt-1.5" /></label>
      <div className="flex items-end gap-2"><button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">{loading ? "Loading…" : "Apply filters"}</button><button type="button" onClick={clear} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-semibold">Clear</button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--ll-error)]">{error}</p>}
    {loading && !report && <div role="status" className="ll-panel-muted mt-6 grid h-52 place-items-center text-sm font-semibold text-slate-600">Loading activity timeline…</div>}
    {report && <section aria-busy={loading} className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9A6510]">Activity timeline</p><h2 className="mt-2 text-xl font-bold text-[var(--ll-navy)]">{report.pagination.totalItems} total recorded event{report.pagination.totalItems === 1 ? "" : "s"}</h2></div><p className="text-xs font-semibold text-slate-600">Page {report.pagination.page} of {report.pagination.totalPages} · newest first</p></div>
      <div className="mt-5 space-y-3">
        {report.events.map(event => (
          <article
            data-testid="audit-event"
            key={event.id}
            className="ll-panel p-4 sm:p-5 shadow-xs border border-slate-200/90 hover:border-[#C5A56A]/50 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-block rounded-full bg-[#C5A56A]/10 border border-[#C5A56A]/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9A6510]">
                  {actionLabel(event.action)}
                </span>
                <p className="mt-2 text-base font-bold text-[var(--ll-navy)]">
                  {event.actorName}{" "}
                  <span className="ml-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                    {event.actorRole}
                  </span>
                </p>
                <p className="mt-1 font-mono text-[10px] font-medium text-slate-500">
                  {event.actorId} · {event.id}
                </p>
              </div>
              <time className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {new Date(event.timestamp).toLocaleString("en-NG")}
              </time>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Record type</p>
                <p className="mt-1 font-bold text-slate-900 capitalize">{event.entityType}</p>
                <p className="mt-1 break-all font-mono text-[10px] font-medium text-slate-600">{event.entityId}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Outlet</p>
                <p className="mt-1 font-bold text-slate-900">{event.outletName || "Unavailable"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Order reference</p>
                <p className="mt-1 break-all font-mono text-xs font-bold text-slate-900">{event.orderReference || "Unavailable"}</p>
                <p className="mt-1 break-all font-mono text-[10px] font-medium text-slate-600">{event.transactionId || "Transaction unavailable"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Linked request</p>
                <p className="mt-1 break-all font-mono text-xs font-bold text-slate-900">{event.overrideId || event.requestId || "Unavailable"}</p>
              </div>
            </div>
            {(event.beforeValue !== null || event.afterValue !== null || event.eventDetails) && (
              <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-bold text-[#9A6510]">View details of change</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Before</p>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-slate-800">{detailValue(event.beforeValue)}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">After</p>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-slate-800">{detailValue(event.afterValue)}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Details</p>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-slate-800">{event.eventDetails ? detailValue({ ...event.eventDetails, proposedAmount: proposedAmount(event.eventDetails) }) : "Unavailable"}</pre>
                  </div>
                </div>
              </details>
            )}
          </article>
        ))}
        {!report.events.length && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-medium text-slate-600">
            No events found matching your search.
          </p>
        )}
      </div>
      <div className="ll-panel mt-5 flex items-center justify-between p-3 shadow-xs"><button disabled={loading || report.pagination.page <= 1} onClick={() => session && void load(session, report.pagination.page - 1, { from, to, employee, action, outlet, reference })} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Previous</button><span className="text-xs font-semibold text-slate-600">{report.pagination.totalItems} total · {report.pagination.pageSize} per page</span><button disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => session && void load(session, report.pagination.page + 1, { from, to, employee, action, outlet, reference })} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Next</button></div>
      <article className="ll-panel mt-5 p-5 shadow-xs"><p className="text-sm font-bold text-[var(--ll-navy)]">Activity log coverage</p><ul className="mt-3 space-y-2 text-sm leading-6 font-medium text-slate-700">{report.limitations.map(item => <li key={item}>• {item}</li>)}</ul></article>
    </section>}
  </main></ManagementShell>;
}
