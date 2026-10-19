/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StaffShell, useStaffSession } from "@/components/staff/StaffShell";
import { getItem, money, outlets, type OrderStatus } from "@/lib/fnb";

const next: Record<string, OrderStatus | undefined> = {
  received: "preparing",
  preparing: "ready",
  ready: "completed",
};

export default function StaffOrderDetail() {
  const { reference } = useParams<{ reference: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const user = useStaffSession();

  const load = () =>
    fetch("/api/demo", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData);

  useEffect(() => {
    void load();
  }, []);

  const order = data?.orders.find((entry: any) => entry.reference === reference);
  const isSupervisor = user?.role === "supervisor";
  const isQrEnabled = Boolean(order?.hasVerification);

  const advance = async () => {
    if (!order || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateOrder",
        actorId: user?.id,
        reference,
        status: next[order.status],
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) setError(result.error);
    else setData(result.snapshot);
  };

  const handleSupervisorException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionReason.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/staff/order-verification/exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderReference: reference,
          reason: exceptionReason.trim(),
        }),
      });
      const result = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(result.error || "Exception could not be recorded.");
      } else {
        setExceptionOpen(false);
        setExceptionReason("");
        void load();
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Exception failed.");
    }
  };

  return (
    <StaffShell>
      {!order ? (
        <p className="text-[var(--ll-muted)]">Loading order details…</p>
      ) : (
        <div className="mx-auto max-w-3xl">
          <Link
            href="/staff"
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-[#172B42] shadow-2xs transition-all hover:border-[#C5A56A] hover:bg-slate-50 hover:text-[#9A6510] active:scale-95"
          >
            <svg
              className="size-3.5 text-slate-500 transition-transform duration-200 group-hover:-translate-x-1 group-hover:text-[#9A6510]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Service queue</span>
          </Link>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-[var(--ll-muted)]">{order.reference}</p>
              <h1 className="mt-2 font-serif text-3xl font-bold text-[var(--ll-navy)]">
                {order.customerName || "Demo guest"}
              </h1>
              <p className="mt-2 text-sm text-[var(--ll-muted)]">
                {outlets.find((outlet) => outlet.id === order.outletId)?.name} ·{" "}
                {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span className="rounded-full bg-[#d4b36e]/20 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--ll-navy)]">
              {order.status === "completed" ? "Completed / Received" : order.status}
            </span>
          </div>

          <section className="mt-7 rounded-2xl border border-[var(--ll-border)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-lg text-[var(--ll-navy)]">Order items</h2>
            <div className="mt-4 space-y-3">
              {order.items.map((line: any) => (
                <div className="flex justify-between text-sm" key={line.key}>
                  <span className="text-[var(--ll-slate)]">
                    {line.quantity}× {getItem(line.itemId)?.name}
                  </span>
                  <span className="font-medium text-[var(--ll-navy)]">
                    {money(
                      ((getItem(line.itemId)?.price || 0) +
                        line.choices.reduce((sum: number, choice: any) => sum + choice.price, 0)) *
                        line.quantity
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-[var(--ll-border)] pt-4 text-base font-semibold">
              <span className="text-[var(--ll-muted)]">Order paid · Settled</span>
              <span className="text-[var(--ll-navy)] font-bold">{money(order.total)}</span>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-[var(--ll-border)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-lg text-[var(--ll-navy)]">Order progress & fulfillment</h2>
            <p className="mt-2 text-sm text-[var(--ll-muted)]">
              Received at {new Date(order.createdAt).toLocaleString()}. All status updates are recorded in the activity log.
            </p>

            {order.status === "received" && (
              <button
                disabled={busy}
                onClick={advance}
                className="mt-5 rounded-xl bg-[var(--ll-navy)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0F2133] transition"
              >
                {busy ? "Updating…" : "Mark as preparing"}
              </button>
            )}

            {order.status === "preparing" && (
              <button
                disabled={busy}
                onClick={advance}
                className="mt-5 rounded-xl bg-[#d4b36e] px-5 py-3 text-sm font-bold text-[#152018] hover:bg-[#c9a563] transition"
              >
                {busy ? "Updating…" : "Mark as ready"}
              </button>
            )}

            {order.status === "ready" && (
              <div className="mt-5 space-y-4">
                {isQrEnabled ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <p className="font-semibold">QR / Collection Code Verification Required</p>
                      <p className="mt-1 text-xs leading-5">
                        This order received a secure purchase credential. To ensure exactly-once physical handoff, staff must scan the QR code or enter the guest’s manual collection code.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                      <Link
                        href={`/staff/verify?order=${order.reference}`}
                        className="ll-btn ll-btn-primary h-11 w-full whitespace-nowrap px-4 text-xs sm:text-sm"
                      >
                        Verify handoff
                      </Link>

                      {isSupervisor && (
                        <button
                          type="button"
                          onClick={() => setExceptionOpen(!exceptionOpen)}
                          className="ll-btn h-10 w-full whitespace-nowrap border border-amber-800 bg-amber-700 px-4 text-xs text-white hover:bg-amber-800 sm:w-auto"
                        >
                          Supervisor exception
                        </button>
                      )}
                    </div>

                    {exceptionOpen && isSupervisor && (
                      <form onSubmit={handleSupervisorException} className="mt-4 rounded-xl border border-amber-300 bg-amber-50/50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                          Authorized Supervisor Exception
                        </p>
                        <p className="mt-1 text-xs text-amber-800">
                          Complete this order if the guest cannot produce their code. This action is permanently attributed to your supervisor session in the activity log.
                        </p>
                        <textarea
                          value={exceptionReason}
                          onChange={(e) => setExceptionReason(e.target.value)}
                          placeholder="State the exception reason (e.g. Guest phone battery depleted; verified identity in person)."
                          className="ll-input mt-3 min-h-20"
                          required
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="submit"
                            disabled={busy || !exceptionReason.trim()}
                            className="ll-btn bg-amber-700 text-white hover:bg-amber-800 text-xs"
                          >
                            {busy ? "Recording…" : "Authorize & Complete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExceptionOpen(false)}
                            className="ll-btn ll-btn-secondary text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <div>
                    <p className="text-xs text-[var(--ll-muted)] mb-3">
                      Historical order without QR verification. Can be completed directly.
                    </p>
                    <button
                      disabled={busy}
                      onClick={advance}
                      className="rounded-xl bg-[#d4b36e] px-5 py-3 text-sm font-bold text-[#152018] hover:bg-[#c9a563] transition"
                    >
                      {busy ? "Updating…" : "Mark as completed"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {order.status === "completed" && (
              <p className="mt-5 text-sm font-semibold text-emerald-700">
                ✓ This order has been completed and received.
              </p>
            )}

            {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
          </section>
        </div>
      )}
    </StaffShell>
  );
}
