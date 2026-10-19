"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export type GuestVerification = {
  token: string;
  collectionCode?: string;
  handoffMode: string;
  expiresAt: string;
};

export function OrderVerificationQr({
  verification,
  orderStatus,
  paymentStatus,
}: {
  verification?: GuestVerification;
  orderStatus: string;
  paymentStatus?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isReady = orderStatus === "ready";
  const isNotReadyYet = ["received", "preparing"].includes(orderStatus);

  useEffect(() => {
    if (!isOpen || !verification?.token || !canvas.current) return;
    void QRCode.toCanvas(canvas.current, verification.token, {
      width: 220,
      margin: 2,
      color: { dark: "#172B42", light: "#FAF9F6" },
    }).catch(() => setError("The pickup code could not be displayed."));
  }, [isOpen, verification?.token]);

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const unavailable = !verification
    ? "This order was created before collection code verification was enabled on this device."
    : orderStatus === "completed"
    ? "This order has already been handed over and completed."
    : ["refunded", "voided"].includes(paymentStatus || "")
    ? "This order is no longer allowed for collection."
    : null;

  if (unavailable || !verification) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Collection status
        </h2>
        <p className="mt-1 text-xs text-slate-500">{unavailable}</p>
      </section>
    );
  }

  const modeLabel =
    verification.handoffMode === "counter"
      ? "Counter pickup"
      : verification.handoffMode === "table"
      ? "Table delivery"
      : verification.handoffMode === "room"
      ? "Room / Cottage delivery"
      : "Golf course delivery";

  const statusLabel =
    orderStatus === "received"
      ? "Received by kitchen"
      : orderStatus === "preparing"
      ? "Being prepared"
      : "Ready for collection";

  function copyCode() {
    if (!verification?.collectionCode) return;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(verification.collectionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      {/* Compact Pickup Pass Trigger Card */}
      <div
        className={`mt-4 overflow-hidden rounded-2xl border p-4 text-white shadow-sm transition-all duration-500 ${
          isReady
            ? "border-emerald-400/50 bg-gradient-to-br from-[#0F3D2E] via-[#145A3A] to-[#0D2E22] ring-1 ring-emerald-400/20"
            : "border-[#C5A56A]/30 bg-gradient-to-br from-[#172B42] via-[#1E3858] to-[#122336] opacity-90"
        }`}
      >
        {/* Status-aware banner */}
        {isNotReadyYet && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2 border border-white/[0.06]">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
            </span>
            <p className="text-[11px] font-semibold text-amber-200/90">
              {orderStatus === "received"
                ? "Your order has been received. The kitchen will begin preparation shortly."
                : "Your order is being prepared. You'll be able to collect once it's ready."}
            </p>
          </div>
        )}
        {isReady && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 border border-emerald-400/20">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-[11px] font-bold text-emerald-200">
              Your order is ready! Present the QR code or collection code to staff now.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              isReady ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-[#E5C384]"
            }`}>
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 20h3v1h-3z" />
              </svg>
            </div>
            <div className="min-w-0">
              <span className={`block text-[10px] font-bold uppercase tracking-wider ${
                isReady ? "text-emerald-400" : "text-[#C5A56A]"
              }`}>
                {isReady ? "Ready · Collect Now" : "Pickup & Handoff Pass"}
              </span>
              <span className={`block font-mono text-sm font-bold tracking-wider truncate ${
                isNotReadyYet ? "text-white/50 blur-[3px] select-none" : "text-white"
              }`}>
                {verification.collectionCode || "Code Ready"}
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                {modeLabel} · {statusLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 ${
              isReady
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:brightness-110 ring-1 ring-emerald-400/30"
                : "bg-gradient-to-r from-[#9A6510] to-[#C5A56A] hover:brightness-105"
            }`}
          >
            <span>{isReady ? "Show QR" : "View Pass"}</span>
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Slide-Up Bottom Sheet Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag bar */}
            <div className="mx-auto -mt-2 mb-4 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />

            {/* Not-ready notice */}
            {isNotReadyYet && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900">Not ready for collection yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    {orderStatus === "received"
                      ? "Your order has been received by the kitchen and will begin preparation soon. You'll be able to present this code once the order status changes to Ready."
                      : "Your order is currently being prepared by the kitchen team. Please wait until it's marked as Ready before presenting this code to staff."}
                  </p>
                </div>
              </div>
            )}

            {/* Ready banner */}
            {isReady && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-900">Ready for collection!</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    Present the QR code below or read out your collection code to any member of Lakowe staff.
                  </p>
                </div>
              </div>
            )}

            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9A6510]">
                  Collection & Handoff
                </span>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#172B42]">
                  {isReady ? "Present to Lakowe staff" : "Your pickup pass"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {isReady
                    ? "Show this QR code or provide your collection code when receiving your order."
                    : "Keep this pass ready. You can present it to staff once your order is marked as Ready."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
                aria-label="Close pass"
              >
                ✕
              </button>
            </div>

            {/* QR Canvas */}
            <div className={`mx-auto mt-5 w-fit rounded-2xl p-3 shadow-md border transition-all ${
              isReady
                ? "bg-[#FAF9F6] border-emerald-200"
                : "bg-[#FAF9F6] border-slate-100 opacity-40 blur-sm pointer-events-none"
            }`}>
              <canvas ref={canvas} className="block rounded" aria-label="Order pickup QR code" />
            </div>

            {isNotReadyYet && (
              <p className="mt-2 text-center text-[11px] font-semibold text-amber-700">
                QR code will activate when your order is Ready
              </p>
            )}

            {/* Manual Collection Code */}
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Manual Collection Code
              </p>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className={`font-mono text-lg font-bold tracking-wider text-[#172B42] ${
                  isNotReadyYet ? "blur-[4px] select-none" : ""
                }`}>
                  {verification.collectionCode || "Available on original confirmation"}
                </span>
                {verification.collectionCode && isReady && (
                  <button
                    type="button"
                    onClick={copyCode}
                    className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-2xs border border-slate-200 hover:bg-slate-100 active:scale-95"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              {isNotReadyYet && (
                <p className="mt-1.5 text-[10px] font-medium text-amber-700">
                  Code is hidden until order is ready
                </p>
              )}
            </div>

            {/* Timing / Mode details */}
            <div className="mt-4 text-center text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">
                {modeLabel} · Valid until {new Date(verification.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-[11px] text-slate-600">
                {isReady
                  ? "This screen can be shared with someone collecting on your behalf."
                  : "Refresh the order page to check if your order is ready."}
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-3 text-center text-xs font-bold text-rose-600">
                {error}
              </p>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full rounded-2xl bg-[#172B42] py-3 text-xs font-bold text-white transition hover:bg-[#1E3858] active:scale-98"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}