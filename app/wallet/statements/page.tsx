"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { DiningNav } from "@/components/fnb/FnbShell";
import { money, outlets } from "@/lib/fnb";
import type { StatementResponse } from "@/lib/statement";
import { Dropdown } from "@/components/ui/Dropdown";

async function requestError(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  return new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback);
}

export default function Statements() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outlet, setOutlet] = useState("");
  const [payment, setPayment] = useState("");
  const [result, setResult] = useState<{ data: StatementResponse; query: string } | null>(null);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async (query: string) => {
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/wallet/statements?${query}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw await requestError(response, "Statement unavailable.");
      const data: StatementResponse = await response.json();
      if (version === requestVersion.current && !controller.signal.aborted) setResult({ data, query });
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Statement unavailable. Please try again.");
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
    return () => {
      activeRequest.current?.abort();
    };
  }, [load]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from && to && to < from) {
      setError("End date cannot be before start date.");
      return;
    }
    const query = new URLSearchParams(Object.entries({ from, to, outlet, payment }).filter(([, value]) => value)).toString();
    void load(query);
  }

  function reset() {
    setFrom("");
    setTo("");
    setOutlet("");
    setPayment("");
    void load("");
  }

  async function download(format: "csv" | "pdf") {
    if (!result || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const query = new URLSearchParams(result.query);
      query.set("format", format);
      const response = await fetch(`/api/wallet/statements?${query}`, { cache: "no-store" });
      if (!response.ok) throw await requestError(response, `${format.toUpperCase()} download failed.`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lakowe-demo-statement.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const data = result?.data;
  return (
    <main className="ll-page pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md shadow-xs">
        <div className="ll-container flex items-center justify-between">
          <Link
            href="/wallet"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-[#172B42] shadow-xs transition hover:bg-slate-100 active:scale-95"
            aria-label="Back to Golfer Wallet"
          >
            <svg className="size-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Golfer Wallet</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384]">
              LL
            </span>
            <span className="hidden font-serif text-sm font-bold text-[#172B42] sm:inline-block">
              Expenditure Statements
            </span>
          </div>
          <span className="ll-status ll-status-info font-bold">Statements</span>
        </div>
      </header>

      <section className="ll-container py-8">
        <h1 className="ll-page-title">Expenditure statement</h1>
        <p className="mt-2 text-sm text-[var(--ll-muted)]">
          Only posted Lakowe Lakes demo wallet purchases are included. Deposits are excluded.
        </p>

        <form onSubmit={apply} className="ll-panel mt-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="ll-label">
            Start date
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="ll-input mt-1.5"
            />
          </label>
          <label className="ll-label">
            End date
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="ll-input mt-1.5"
            />
          </label>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
              Outlet
            </span>
            <Dropdown
              value={outlet}
              onChange={setOutlet}
              options={[
                { value: "", label: "All outlets" },
                ...outlets.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </div>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
              Payment
            </span>
            <Dropdown
              value={payment}
              onChange={setPayment}
              options={[
                { value: "", label: "All supported" },
                { value: "wallet_demo", label: "Golfer Wallet (Demo)" },
              ]}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button className="ll-btn ll-btn-primary">Apply filters</button>
            <button type="button" onClick={reset} className="ll-btn ll-btn-ghost">
              Reset
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="ll-alert ll-status-error mt-4">
            {error}
          </p>
        )}
        {downloadError && (
          <p role="alert" className="ll-alert ll-status-error mt-4">
            {downloadError}
          </p>
        )}

        <section aria-busy={loading} className="ll-panel mt-6 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--ll-muted)]">
                Eligible expenditure · {data?.rows.length ?? 0} transaction(s)
              </p>
              <p className="ll-amount mt-2 text-3xl font-bold text-[var(--ll-navy)]">
                {data ? money(data.total) : loading ? "Loading…" : "Statement unavailable"}
              </p>
              {data && (
                <p className="mt-2 text-xs text-[var(--ll-muted)]">
                  {data.from || "All time"} to {data.to || "Present"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!result || downloading}
                onClick={() => void download("csv")}
                className="ll-btn ll-btn-secondary"
              >
                CSV
              </button>
              <button
                type="button"
                disabled={!result || downloading}
                onClick={() => void download("pdf")}
                className="ll-btn ll-btn-primary"
              >
                PDF
              </button>
            </div>
          </div>
          {downloading && (
            <p role="status" className="mt-3 text-sm text-[var(--ll-muted)]">
              Preparing download…
            </p>
          )}
        </section>

        <div className="mt-6 space-y-3">
          {loading && (
            <p role="status" className="text-sm text-[var(--ll-muted)]">
              Refreshing statement…
            </p>
          )}
          {data?.rows.length ? (
            data.rows.map((row) => (
              <article
                key={row.reference}
                className="ll-panel flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <b className="text-[var(--ll-navy)]">{row.outlet}</b>
                  <p className="mt-1 text-xs text-[var(--ll-muted)]">
                    {new Date(row.createdAt).toLocaleString()} · {row.orderReference} · {row.paymentMethod}
                  </p>
                </div>
                <p className="ll-amount font-bold text-[var(--ll-navy)]">{money(row.amount)}</p>
              </article>
            ))
          ) : (
            data && (
              <p className="ll-panel-muted p-8 text-center text-sm text-[var(--ll-muted)]">
                No eligible expenditure in this reporting period.
              </p>
            )
          )}
        </div>
      </section>
      <DiningNav />
    </main>
  );
}
