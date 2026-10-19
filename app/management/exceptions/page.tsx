"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ManagementLoginRequired, ManagementShell } from "@/components/management/ManagementShell";
import { staffSession } from "@/components/staff/StaffShell";
import { Dropdown } from "@/components/ui/Dropdown";
type Session={id:string;name:string;role:string};type Filters={from:string;to:string;category:string;severity:string;outlet:string};type Row={id:string;categoryLabel:string;severity:string;outletName:string|null;reference:string;status:string;detectedAt:string;explanation:string;nextStep:string;href:string};type Report={options:{categories:{id:string;label:string}[];severities:string[];outlets:{id:string;name:string}[]};summary:{total:number;high:number;medium:number;info:number};pagination:{page:number;totalPages:number;totalItems:number};exceptions:Row[];severityRules:string[];limitations:string[]};
const blank:Filters={from:"",to:"",category:"",severity:"",outlet:""};const title=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default function ExceptionsPage() {
  const [session, setSession] = useState<Session | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [filters, setFilters] = useState(blank),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");

  const load = useCallback(async (user: Session, page = 1, selected = blank) => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams(
          Object.entries({ ...selected, page: String(page), pageSize: "10" }).filter(([, v]) => v)
        ).toString(),
        r = await fetch("/api/management/exceptions?" + q, {
          headers: { "x-demo-user-id": user.id },
          credentials: "include",
          cache: "no-store",
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error || "Exception monitoring is unavailable.");
      setReport(b.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exception monitoring is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const u = staffSession();
      setSession(u);
      if (u && u.role === "supervisor") void load(u);
      else setLoading(false);
    };
    sync();
    window.addEventListener("lakowe-staff-session-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lakowe-staff-session-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, [load]);

  if (!session || session.role !== "supervisor") return <ManagementLoginRequired />;
  const update = (k: keyof Filters, v: string) => setFilters((x) => ({ ...x, [k]: v }));
  const apply = (e: FormEvent) => {
    e.preventDefault();
    void load(session, 1, filters);
  };

  return (
    <ManagementShell userName={session.name}>
      <main className="min-w-0 p-4 sm:p-6 xl:p-9" data-page="management-exceptions">
        <header>
          <p className="ll-eyebrow text-[#9A6510]">Operational Alerts</p>
          <h1 className="ll-page-title mt-2">Issue monitoring</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">
            Review flagged orders, unposted room charges, and items needing supervisor attention across dining venues.
          </p>
        </header>

        <form onSubmit={apply} className="ll-panel mt-7 p-6 shadow-xs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              From
              <input
                aria-label="Start date"
                type="date"
                value={filters.from}
                onChange={(e) => update("from", e.target.value)}
                className="ll-input mt-1.5"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              To
              <input
                aria-label="End date"
                type="date"
                value={filters.to}
                onChange={(e) => update("to", e.target.value)}
                className="ll-input mt-1.5"
              />
            </label>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
                Category
              </span>
              <Dropdown
                aria-label="Exception category"
                value={filters.category}
                onChange={(val) => update("category", val)}
                options={[
                  { value: "", label: "All categories" },
                  ...(report?.options.categories.map((x) => ({ value: x.id, label: x.label })) || []),
                ]}
              />
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
                Severity
              </span>
              <Dropdown
                aria-label="Exception severity"
                value={filters.severity}
                onChange={(val) => update("severity", val)}
                options={[
                  { value: "", label: "All severities" },
                  ...(report?.options.severities.map((x) => ({ value: x, label: title(x) })) || []),
                ]}
              />
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
                Outlet
              </span>
              <Dropdown
                aria-label="Outlet"
                value={filters.outlet}
                onChange={(val) => update("outlet", val)}
                options={[
                  { value: "", label: "All outlets" },
                  ...(report?.options.outlets.map((x) => ({ value: x.id, label: x.name })) || []),
                ]}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
            <button className="ll-btn ll-btn-primary min-h-[44px] px-6 text-sm font-bold shadow-xs">
              Apply filters
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(blank);
                void load(session);
              }}
              className="ll-btn ll-btn-ghost text-sm font-semibold"
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="ll-alert ll-status-error mt-4">
            {error}
          </p>
        )}

        {loading && !report && (
          <p role="status" className="mt-6 text-sm font-medium text-slate-600">
            Loading persisted exceptions...
          </p>
        )}

        {report && (
          <section className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["All", report.summary.total],
                ["High", report.summary.high],
                ["Medium", report.summary.medium],
                ["Informational", report.summary.info],
              ].map(([n, c]) => (
                <article key={String(n)} className="ll-panel p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{n}</p>
                  <p className="ll-amount mt-2 text-3xl font-bold text-[var(--ll-navy)]">{c}</p>
                </article>
              ))}
            </div>

            <div className="space-y-4">
              {report.exceptions.map((x) => (
                <article data-testid="exception" key={x.id} className="ll-panel p-6 shadow-xs">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#9A6510]">
                        {x.categoryLabel}
                      </p>
                      <h2 className="mt-1 font-mono text-base font-bold text-[var(--ll-navy)]">
                        {x.reference}
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {x.outletName || "No outlet"} · {new Date(x.detectedAt).toLocaleString("en-NG")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={"ll-status " + (x.severity === "high" ? "ll-status-error" : x.severity === "medium" ? "ll-status-warning" : "ll-status-info")}>
                        {title(x.severity)}
                      </span>
                      <span className="ll-status bg-slate-100 text-slate-800 font-bold">
                        {title(x.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 border-t border-slate-200 pt-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Explanation
                      </p>
                      <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-800">
                        {x.explanation}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Recommended next step
                      </p>
                      <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-800">
                        {x.nextStep}
                      </p>
                      <Link
                        href={x.href}
                        className="group mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ll-navy)] transition-colors hover:text-[#9A6510]"
                      >
                        <span>Open relevant workflow</span>
                        <svg className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
              {!report.exceptions.length && (
                <p className="ll-panel-muted p-8 text-center text-sm font-medium text-slate-600">
                  No persisted exceptions match these filters.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <button
                disabled={report.pagination.page <= 1}
                onClick={() => void load(session, report.pagination.page - 1, filters)}
                className="ll-btn ll-btn-secondary min-h-[38px] text-xs font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-700">
                {report.pagination.totalItems} total · Page {report.pagination.page} of {report.pagination.totalPages}
              </span>
              <button
                disabled={report.pagination.page >= report.pagination.totalPages}
                onClick={() => void load(session, report.pagination.page + 1, filters)}
                className="ll-btn ll-btn-secondary min-h-[38px] text-xs font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="ll-panel p-5">
                <h2 className="ll-section-title text-sm font-bold">Deterministic severity rules</h2>
                <div className="mt-3 space-y-2">
                  {report.severityRules.map((x) => (
                    <p key={x} className="text-xs font-medium text-slate-700">
                      • {x}
                    </p>
                  ))}
                </div>
              </article>
              <article className="ll-panel p-5">
                <h2 className="ll-section-title text-sm font-bold">Coverage limitations</h2>
                <div className="mt-3 space-y-2">
                  {report.limitations.map((x) => (
                    <p key={x} className="text-xs font-medium text-slate-700">
                      • {x}
                    </p>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}
      </main>
    </ManagementShell>
  );
}