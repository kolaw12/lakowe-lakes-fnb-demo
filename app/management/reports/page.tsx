"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import { money } from "@/lib/fnb";
import { Dropdown } from "@/components/ui/Dropdown";
import type { AdvancedReportDataset, AdvancedReportType, ReportCell, ReportColumn } from "@/lib/advanced-reporting";

const ADVANCED_REPORT_TYPES: AdvancedReportType[] = ["sales", "outlets", "employees", "overrides"];

type Session = { id: string; name: string; role: string };
type ResponseBody = { access: { id: string; name: string; role: string }; report: AdvancedReportDataset };
type Filters = { from: string; to: string; outlet: string; employee: string; supervisor: string; transactionStatus: string; paymentMethod: string; overrideStatus: string };
const emptyFilters: Filters = { from: "", to: "", outlet: "", employee: "", supervisor: "", transactionStatus: "", paymentMethod: "", overrideStatus: "" };
const reportNames: Record<AdvancedReportType, string> = { sales: "Sales", outlets: "Outlet Performance", employees: "Employee Activity", overrides: "Supervisor Overrides" };
const PAGE_SIZE = 12;

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Advanced reporting is unavailable.");
}
function formatCell(value: ReportCell, column: ReportColumn) {
  if (value === null) return "Unavailable";
  if (column.type === "money" && typeof value === "number") return money(value);
  if (column.type === "number" && typeof value === "number") return value.toLocaleString("en-NG");
  if (column.type === "date" && typeof value === "string") return new Date(value).toLocaleString("en-NG");
  return String(value);
}
function SummaryValue({ item }: { item: AdvancedReportDataset["summary"][number] }) {
  return <>{item.type === "money" && typeof item.value === "number" ? money(item.value) : typeof item.value === "number" ? item.value.toLocaleString("en-NG") : item.value}</>;
}
function SalesTrend({ rows }: { rows: NonNullable<AdvancedReportDataset["charts"]["salesTrend"]> }) {
  const width = 720, height = 220, left = 48, right = 18, top = 20, bottom = 38;
  const max = Math.max(...rows.map(row => row.sales), 1);
  const x = (index: number) => rows.length === 1 ? width / 2 : left + index * ((width - left - right) / (rows.length - 1));
  const y = (amount: number) => top + (1 - amount / max) * (height - top - bottom);
  const points = rows.map((row, index) => `${x(index)},${y(row.sales)}`).join(" ");
  return <article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5"><h3 className="text-sm font-semibold text-[#e2c783]">Daily eligible sales trend</h3>{rows.length ? <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-auto w-full" role="img" aria-label="Daily eligible sales trend">{[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - right} y1={top + fraction * (height - top - bottom)} y2={top + fraction * (height - top - bottom)} stroke="rgba(255,255,255,.08)" /><text x={left - 8} y={top + fraction * (height - top - bottom) + 4} textAnchor="end" fill="rgba(255,255,255,.35)" fontSize="10">{new Intl.NumberFormat("en-NG", { notation: "compact" }).format(max * (1 - fraction) / 100)}</text></g>)}{rows.length > 1 && <polyline points={points} fill="none" stroke="#d8b874" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}{rows.map((row, index) => <g key={row.date}><circle cx={x(index)} cy={y(row.sales)} r="5" fill="#0d1710" stroke="#e2c783" strokeWidth="3"><title>{row.date}: {money(row.sales)} · {row.transactions} transaction(s)</title></circle><text x={x(index)} y={height - 12} textAnchor="middle" fill="rgba(255,255,255,.45)" fontSize="10">{new Date(`${row.date}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })}</text></g>)}</svg> : <p className="mt-5 text-sm text-white/35">No eligible daily sales for these filters.</p>}</article>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ id: string; label: string; value: number; note: string }> }) {
  const max = Math.max(...rows.map(row => row.value), 1);
  return <article className="rounded-2xl border border-white/[.08] bg-[#141f17] p-5"><h3 className="text-sm font-semibold text-[#e2c783]">{title}</h3><div className="mt-5 space-y-5">{rows.map(row => <div key={row.id}><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-xs text-white/35">{row.note}</p></div><p className="text-sm font-semibold">{money(row.value)}</p></div><div className="mt-2 h-2 rounded-full bg-white/[.06]"><div className="h-2 rounded-full bg-gradient-to-r from-[#8e7138] to-[#e2c783]" style={{ width: `${row.value ? Math.max(2, row.value / max * 100) : 0}%` }} /></div></div>)}{!rows.length && <p className="text-sm text-white/35">No chart data for these filters.</p>}</div></article>;
}

export default function AdvancedReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedType, setSelectedType] = useState<AdvancedReportType>("sales");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [result, setResult] = useState<{ body: ResponseBody; query: string } | null>(null);
  const [loading, setLoading] = useState(true); const [downloading, setDownloading] = useState<"" | "csv" | "pdf">(""); const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null); const requestVersion = useRef(0);

  const loadQuery = useCallback(async (currentSession: Session, query: string) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/management/reports?${query}`, {
        headers: { "x-demo-user-id": currentSession.id },
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      const body: ResponseBody = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setResult({ body, query });
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Advanced reporting is unavailable.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);
  const queryFor = useCallback((type: AdvancedReportType, values: Filters, page = 1) => {
    const relevant: Record<AdvancedReportType, Partial<Filters>> = {
      sales: { from: values.from, to: values.to, outlet: values.outlet, transactionStatus: values.transactionStatus, paymentMethod: values.paymentMethod },
      outlets: { from: values.from, to: values.to, outlet: values.outlet },
      employees: { from: values.from, to: values.to, outlet: values.outlet, employee: values.employee },
      overrides: { from: values.from, to: values.to, outlet: values.outlet, employee: values.employee, supervisor: values.supervisor, overrideStatus: values.overrideStatus },
    };
    return new URLSearchParams(Object.entries({ type, ...relevant[type], page: String(page), pageSize: String(PAGE_SIZE) }).filter(([, value]) => value)).toString();
  }, []);

  useEffect(() => {
    const sync = () => {
      const current = staffSession();
      setSession(current);
      if (current && current.role === "supervisor") void loadQuery(current, queryFor("sales", emptyFilters));
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
  }, [loadQuery, queryFor]);

  function update(name: keyof Filters, value: string) { setFilters(current => ({ ...current, [name]: value })); }
  function choose(type: AdvancedReportType) {
    setSelectedType(type); setFilters(emptyFilters);
    if (session) void loadQuery(session, queryFor(type, emptyFilters));
  }
  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (filters.from && filters.to && filters.from > filters.to) { setError("End date cannot be before start date."); return; }
    void loadQuery(session, queryFor(selectedType, filters));
  }
  function clear() {
    setFilters(emptyFilters);
    if (session) void loadQuery(session, queryFor(selectedType, emptyFilters));
  }
  function changePage(page: number) {
    if (!session || !result) return;
    const query = new URLSearchParams(result.query); query.set("page", String(page));
    void loadQuery(session, query.toString());
  }
  async function download(format: "csv" | "pdf") {
    if (!session || !result || downloading) return;
    setDownloading(format); setError("");
    try {
      const query = new URLSearchParams(result.query); query.delete("page"); query.delete("pageSize"); query.set("format", format);
      const response = await fetch(`/api/management/reports?${query}`, {
        headers: { "x-demo-user-id": session.id },
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw await responseError(response);
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `lakowe-demo-${result.body.report.reportType}-report.${format}`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report download failed.");
    } finally { setDownloading(""); }
  }

  if (!session || session.role !== "supervisor") return <ManagementLoginRequired />;
  const report = result?.body.report;
  const options = report?.filterOptions;
  return <ManagementShell userName={result?.body.access.name || session.name}><main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-reports">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="ll-eyebrow text-[#9A6510]">Executive Reports</p>
        <h1 className="ll-page-title mt-2">Management reports</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">Download and export sales, outlet performance, staff activity, and discount audit summaries.</p>
      </div>
      {report && <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Current report</p><p className="mt-1 text-sm font-bold text-[var(--ll-navy)]">{report.title}</p></div>}
    </header>
    <div className="ll-panel mt-7 grid grid-cols-2 gap-2 p-2 lg:grid-cols-4 shadow-xs">{ADVANCED_REPORT_TYPES.map(type => <button key={type} type="button" onClick={() => choose(type)} className={`rounded-xl px-3 py-3 text-sm font-bold transition-all ${selectedType === type ? "bg-[#172B42] text-white shadow-xs" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>{reportNames[type]}</button>)}</div>
    <form onSubmit={generate} className="ll-panel mt-4 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 shadow-xs">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Start date<input aria-label="Start date" type="date" value={filters.from} onChange={event => update("from", event.target.value)} className="ll-input mt-1.5" /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">End date<input aria-label="End date" type="date" value={filters.to} onChange={event => update("to", event.target.value)} className="ll-input mt-1.5" /></label>
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Outlet</span>
        <Dropdown
          aria-label="Outlet"
          value={filters.outlet}
          onChange={(val) => update("outlet", val)}
          options={[
            { value: "", label: "All outlets" },
            ...(options?.outlets.map((item) => ({ value: item.id, label: item.label })) || []),
          ]}
        />
      </div>
      {selectedType === "sales" && (
        <>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Transaction status</span>
            <Dropdown
              aria-label="Transaction status"
              value={filters.transactionStatus}
              onChange={(val) => update("transactionStatus", val)}
              options={[
                { value: "", label: "All statuses" },
                ...(options?.transactionStatuses.map((item) => ({ value: item.id, label: item.label })) || []),
              ]}
            />
          </div>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Payment method</span>
            <Dropdown
              aria-label="Payment method"
              value={filters.paymentMethod}
              onChange={(val) => update("paymentMethod", val)}
              options={[
                { value: "", label: "All methods" },
                ...(options?.paymentMethods.map((item) => ({ value: item.id, label: item.label })) || []),
              ]}
            />
          </div>
        </>
      )}
      {(selectedType === "employees" || selectedType === "overrides") && (
        <div>
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
            {selectedType === "employees" ? "Employee" : "Requesting employee"}
          </span>
          <Dropdown
            aria-label="Employee"
            value={filters.employee}
            onChange={(val) => update("employee", val)}
            options={[
              { value: "", label: "All recorded actors" },
              ...(options?.employees.map((item) => ({ value: item.id, label: `${item.label} · ${item.role}` })) || []),
            ]}
          />
        </div>
      )}
      {selectedType === "overrides" && (
        <>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Deciding supervisor</span>
            <Dropdown
              aria-label="Supervisor"
              value={filters.supervisor}
              onChange={(val) => update("supervisor", val)}
              options={[
                { value: "", label: "All supervisors" },
                ...(options?.supervisors.map((item) => ({ value: item.id, label: item.label })) || []),
              ]}
            />
          </div>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">Override status</span>
            <Dropdown
              aria-label="Override status"
              value={filters.overrideStatus}
              onChange={(val) => update("overrideStatus", val)}
              options={[
                { value: "", label: "All statuses" },
                ...(options?.overrideStatuses.map((item) => ({ value: item.id, label: item.label })) || []),
              ]}
            />
          </div>
        </>
      )}
      <div className="flex items-end gap-2">
        <button disabled={loading} className="ll-btn ll-btn-primary min-h-[46px] px-6 text-sm font-bold shadow-xs disabled:opacity-50">
          {loading ? "Generating…" : "Generate report"}
        </button>
        <button type="button" onClick={clear} className="ll-btn ll-btn-ghost min-h-[46px] text-sm font-semibold">
          Clear
        </button>
      </div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--ll-error)]">{error}</p>}
    {loading && !report && <div role="status" className="ll-panel-muted mt-6 grid h-52 place-items-center text-sm font-semibold text-slate-600">Generating report…</div>}
    {report && <section aria-busy={loading} className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9A6510]">{report.demo ? "Lakowe Lakes · DEMO" : "Lakowe Lakes"}</p><h2 className="mt-2 text-2xl font-bold text-[var(--ll-navy)]">{report.title}</h2><p className="mt-2 text-sm font-medium text-slate-700">{report.subtitle}</p></div><div className="flex gap-2"><button disabled={Boolean(downloading)} onClick={() => void download("csv")} className="ll-btn ll-btn-secondary min-h-[40px] text-xs font-bold disabled:opacity-40">{downloading === "csv" ? "Preparing…" : "CSV"}</button><button disabled={Boolean(downloading)} onClick={() => void download("pdf")} className="ll-btn ll-btn-primary min-h-[40px] text-xs font-bold disabled:opacity-40">{downloading === "pdf" ? "Preparing…" : "PDF"}</button></div></div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Applied filters">{report.appliedFilters.map(item => <span key={item.key} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs"><b className="font-bold text-slate-900">{item.label}:</b> {item.value}</span>)}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{report.summary.map(item => <article key={item.key} className="ll-panel p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-600">{item.label}</p><p className="ll-amount mt-3 text-2xl font-bold text-[var(--ll-navy)]"><SummaryValue item={item} /></p></article>)}</div>
      {(report.charts.salesTrend || report.charts.paymentBreakdown || report.charts.outletComparison || report.charts.actionBreakdown) && <div className="mt-5 grid gap-5 xl:grid-cols-2">{report.charts.salesTrend && <SalesTrend rows={report.charts.salesTrend} />}{report.charts.paymentBreakdown && <Breakdown title="Payment method breakdown" rows={report.charts.paymentBreakdown.map(item => ({ id: item.id, label: item.label, value: item.sales, note: `${item.transactions} transaction(s)` }))} />}{report.charts.outletComparison && <Breakdown title="Outlet comparison" rows={report.charts.outletComparison.map(item => ({ id: item.id, label: item.label, value: item.sales, note: `${item.orders} orders · ${item.completedOrders} completed · ${item.transactions} sales` }))} />}{report.charts.actionBreakdown && <article className="ll-panel p-5 shadow-xs"><h3 className="text-sm font-bold text-[var(--ll-navy)]">Recorded action breakdown</h3><div className="mt-4 flex flex-wrap gap-2">{report.charts.actionBreakdown.map(item => <span key={item.action} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs">{item.action.replaceAll(".", " · ")} <b className="ml-1 font-bold text-slate-900">{item.count}</b></span>)}</div></article>}</div>}
      <article className="ll-panel mt-5 overflow-hidden shadow-xs"><div className="flex items-end justify-between gap-3 p-5 border-b border-slate-200"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#9A6510]">Report records</p><h3 className="mt-2 text-xl font-bold text-[var(--ll-navy)]">{report.pagination.totalItems} matching row{report.pagination.totalItems === 1 ? "" : "s"}</h3></div><p className="text-xs font-semibold text-slate-600">Page {report.pagination.page} of {report.pagination.totalPages}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-[.06em] text-slate-700 font-bold"><tr>{report.columns.map(column => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr data-testid="report-row" key={`${report.pagination.page}-${index}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">{report.columns.map(column => <td key={column.key} className="max-w-64 px-4 py-3 align-top font-medium text-slate-800">{formatCell(row[column.key] ?? null, column)}</td>)}</tr>)}{!report.rows.length && <tr><td colSpan={report.columns.length} className="px-5 py-12 text-center text-sm font-medium text-slate-600">No records match the applied filters. CSV and PDF exports remain available.</td></tr>}</tbody></table></div></article>
      <div className="ll-panel mt-4 flex items-center justify-between p-3 shadow-xs"><button disabled={loading || report.pagination.page <= 1} onClick={() => changePage(report.pagination.page - 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Previous</button><span className="text-xs font-semibold text-slate-600">{report.pagination.pageSize} per page · export limit {report.exportLimit.toLocaleString()}</span><button disabled={loading || report.pagination.page >= report.pagination.totalPages} onClick={() => changePage(report.pagination.page + 1)} className="ll-btn ll-btn-secondary min-h-[38px] px-4 text-xs font-bold disabled:opacity-30">Next</button></div>
      <article className="ll-panel mt-5 p-5 shadow-xs"><p className="text-sm font-bold text-[var(--ll-navy)]">Coverage and limitations</p><ul className="mt-3 space-y-2 text-sm leading-6 font-medium text-slate-700">{report.limitations.map(item => <li key={item}>• {item}</li>)}</ul></article>
    </section>}
  </main></ManagementShell>;
}
