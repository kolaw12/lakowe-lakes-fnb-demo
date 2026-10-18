"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { money } from "@/lib/fnb";
import { DiningNav } from "@/components/fnb/FnbShell";

type Entry = {
  id: string;
  amount: number;
  type: string;
  status: string;
  description?: string;
  reference: string;
  createdAt: string;
};

type Wallet = {
  owner: string;
  balance: number;
  spending: number;
  entries: Entry[];
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("200000");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = async () => {
    const r = await fetch("/api/wallet", { cache: "no-store" });
    if (!r.ok) throw Error("Wallet is unavailable.");
    setWallet(await r.json());
  };

  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);

  async function deposit(e: FormEvent) {
    e.preventDefault();
    const value = Math.round(Number(amount) * 100);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid amount to add.");
      return;
    }
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deposit",
        amount: value,
        idempotencyKey: "wallet-ui-" + crypto.randomUUID(),
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMessage(d.error || "Money could not be added.");
      return;
    }
    setWallet(d.wallet);
    setMessage("Simulated funds added successfully.");
    setTimeout(() => {
      setShowAddModal(false);
      setMessage("");
    }, 1200);
  }

  const kind = (e: Entry) =>
    e.type === "refund" ? "ll-status-success" : e.type === "purchase" ? "ll-status-info" : "ll-status-warning";

  const entryTypeLabel = (type: string) =>
    type === "purchase" ? "Order paid" : type === "deposit" ? "Money added" : type === "refund" ? "Refund" : type;

  return (
    <main className="ll-page min-h-screen pb-28">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md shadow-xs">
        <div className="ll-container flex items-center justify-between">
          <Link
            href="/dining"
            className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-[#172B42] shadow-xs transition hover:bg-slate-100 active:scale-95"
            aria-label="Back to Dining"
          >
            <svg className="size-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Dining</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384]">
              LL
            </span>
            <span className="hidden font-serif text-sm font-bold text-[#172B42] sm:inline-block">
              Golfer Wallet
            </span>
          </div>
          <span className="rounded-full bg-[#EAF3FA] px-3 py-1 text-xs font-bold text-[#185A8D]">
            Golfer Account
          </span>
        </div>
      </header>

      <section className="ll-container max-w-2xl px-4 py-6">
        {/* Unified Executive Balance Card */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-7 sm:p-9 text-center shadow-xs">
          {/* Top Member Status Pill */}
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
            <span>{wallet?.owner || "Club Golfer"}</span>
            <span className="text-slate-300">/</span>
            <span className="text-[11px] font-bold text-[#167A52]">Active Member</span>
          </div>

          {/* Primary Available Balance Display */}
          <div className="mt-5">
            <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Available Balance
            </span>
            <p className="mt-2 font-serif text-4xl sm:text-5xl font-bold tracking-tight text-[#172B42]">
              {wallet ? money(wallet.balance) : "Loading…"}
            </p>
          </div>

          {/* Secondary Dining Spend Pill */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FAF9F6] px-4 py-1.5 text-xs font-medium text-slate-600 border border-[#E7EBED]">
            <span>Total dining spend:</span>
            <span className="font-serif font-bold text-[#9A6510]">{wallet ? money(wallet.spending) : "₦0"}</span>
          </div>

          {/* Action Row: Full Rounded Pill Buttons */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#172B42] px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-[#0F2133] active:scale-95"
            >
              <svg className="size-4 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Add money</span>
            </button>

            <Link
              href="/wallet/statements"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-[#172B42] shadow-2xs hover:bg-slate-50 transition active:scale-95"
            >
              <svg className="size-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Statements</span>
            </Link>
          </div>
        </div>

        {/* Streamlined Activity Section */}
        <section className="mt-7">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#172B42]">
                Wallet activity
              </h2>
              <p className="text-[11px] text-slate-500">
                {wallet?.entries.length || 0} transaction(s) recorded
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {wallet?.entries.length ? (
              wallet.entries.map((e) => (
                <article
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-[#C5A56A]/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                        e.amount >= 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-50 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {e.amount >= 0 ? (
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6-6m-6 6l-6-6" />
                        </svg>
                      ) : (
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l6 6m-6-6l-6 6" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#172B42] truncate">
                        {entryTypeLabel(e.type)}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 truncate">
                        {(e.description || e.reference)
                          .replace(/\s*—\s*/g, " ")
                          .replace(/—/g, "")
                          .replace(/\s+/g, " ")}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {new Date(e.createdAt).toLocaleString("en-NG", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-serif text-base font-bold ${
                        e.amount >= 0 ? "text-emerald-700" : "text-[#172B42]"
                      }`}
                    >
                      {e.amount >= 0 ? "+" : ""}
                      {money(e.amount)}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        e.amount >= 0
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {e.status === "posted" ? (e.amount >= 0 ? "Added" : "Paid") : e.status}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
                No wallet activity yet.
              </div>
            )}
          </div>
        </section>
      </section>

      {/* Slide-Up Bottom Sheet Modal for "Add Funds" */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A6510]">
                  Instant Top-Up
                </span>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#172B42]">
                  Add money to wallet
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Choose or enter an amount to top up your balance immediately.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                aria-label="Close"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={deposit} className="mt-5 space-y-4">
              {/* Quick Preset Amount Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Select quick amount
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["50000", "100000", "200000"].map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setAmount(preset)}
                      className={`rounded-full py-2 text-xs font-bold transition border ${
                        amount === preset
                          ? "bg-[#172B42] text-white border-[#172B42]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      ₦{Number(preset).toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Or enter amount (₦)
                  <input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="ll-input mt-1.5"
                    placeholder="Enter amount"
                  />
                </label>
              </div>

              {message && (
                <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-center text-xs font-semibold text-emerald-800">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="ll-btn ll-btn-primary w-full rounded-full py-3 text-sm font-bold shadow-sm"
              >
                {busy ? "Adding funds…" : `Add ₦${Number(amount || 0).toLocaleString()} to wallet`}
              </button>
            </form>
          </div>
        </div>
      )}

      <DiningNav />
    </main>
  );
}