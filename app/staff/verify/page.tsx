"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import jsQR from "jsqr";
import { StaffShell, useStaffSession } from "@/components/staff/StaffShell";
import { money, outlets } from "@/lib/fnb";

type PreviewData = {
  verificationId: string;
  orderReference: string;
  customerName?: string;
  outlet: { id: string; name: string };
  handoffMode: string;
  destinationHint: string | null;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  amount: number;
  items: Array<{ itemName: string; quantity: number }>;
  expiresAt: string;
  canConfirm: boolean;
};

type HandoffResult = {
  id: string;
  orderReference: string;
  outletId: string;
  handoffMode: string;
  completedAt: string;
  completedBy: string;
  exceptionReason?: string;
};

function StaffVerifyContent() {
  const searchParams = useSearchParams();
  const user = useStaffSession();
  const [tab, setTab] = useState<"scan" | "manual" | "exception">("scan");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [successResult, setSuccessResult] = useState<HandoffResult | null>(null);

  // Exception form
  const [exceptionOrderRef, setExceptionOrderRef] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Check URL query param on load
  useEffect(() => {
    const urlCode = searchParams.get("code") || searchParams.get("token");
    if (urlCode) {
      setCode(urlCode);
      setTab("manual");
      void runPreview(urlCode);
    }
    const urlRef = searchParams.get("order");
    if (urlRef) {
      setExceptionOrderRef(urlRef);
    }
  }, [searchParams]);

  // Clean up camera on unmount or tab switch
  useEffect(() => {
    if (tab !== "scan") {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [tab]);

  async function startCamera() {
    setCameraError("");
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported on this browser. Please enter the collection code manually.");
      setTab("manual");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setCameraActive(true);
        requestScanFrame();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setCameraError("Camera permission was denied. Please allow camera access in your browser or enter the code manually.");
      } else {
        setCameraError("Could not access camera. Please enter the collection code manually.");
      }
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function requestScanFrame() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(requestScanFrame);
      return;
    }
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imgData.data, imgData.width, imgData.height);
        if (qr && qr.data) {
          stopCamera();
          setCode(qr.data);
          void runPreview(qr.data);
          return;
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(requestScanFrame);
  }

  async function runPreview(credential: string) {
    if (!credential.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);
    setSuccessResult(null);
    try {
      const res = await fetch("/api/staff/order-verification/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: credential.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "The verification code is invalid.");
      }
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/order-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to confirm handoff.");
      }
      setSuccessResult(data.handoff);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSupervisorException(e: React.FormEvent) {
    e.preventDefault();
    if (!exceptionOrderRef.trim() || !exceptionReason.trim()) {
      setError("Please provide the order reference and a clear reason for the exception.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/order-verification/exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderReference: exceptionOrderRef.trim(),
          reason: exceptionReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Exception could not be recorded.");
      }
      setSuccessResult(data.handoff);
      setExceptionOrderRef("");
      setExceptionReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record exception.");
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    stopCamera();
    setCode("");
    setError("");
    setPreview(null);
    setSuccessResult(null);
    setTab("scan");
  }

  const isSupervisor = user?.role === "supervisor";

  return (
    <StaffShell>
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ll-eyebrow">Collection & Handover</p>
            <h1 className="ll-page-title mt-2">Verify order handoff</h1>
            <p className="mt-2 text-sm text-[var(--ll-muted)]">
              Scan guest QR or enter collection code to confirm physical handoff.
            </p>
          </div>
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
        </header>

        {/* Success Card */}
        {successResult && (
          <section className="mt-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center shadow-lg">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500 text-2xl text-white">
              ✓
            </div>
            <h2 className="mt-4 text-2xl font-bold text-emerald-950">Handoff confirmed</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Order <b className="font-mono">{successResult.orderReference}</b> is marked as Completed.
            </p>
            <div className="mx-auto mt-4 max-w-md rounded-xl border border-emerald-500/20 bg-white/70 p-4 text-left text-xs leading-5 text-emerald-950">
              <p><b>Outlet:</b> {outlets.find((o) => o.id === successResult.outletId)?.name || successResult.outletId}</p>
              <p><b>Handoff mode:</b> {successResult.handoffMode.replace("_", " ")}</p>
              <p><b>Completed at:</b> {new Date(successResult.completedAt).toLocaleTimeString()} ({new Date(successResult.completedAt).toLocaleDateString()})</p>
              {successResult.exceptionReason && (
                <p className="mt-1 border-t border-emerald-300 pt-1 text-amber-900">
                  <b>Supervisor exception note:</b> {successResult.exceptionReason}
                </p>
              )}
            </div>
            <button
              onClick={resetAll}
              className="ll-btn ll-btn-primary mt-6"
            >
              Verify next order
            </button>
          </section>
        )}

        {/* Order Preview Card */}
        {preview && !successResult && (
          <section className="mt-7 ll-panel p-6 shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <p className="ll-eyebrow">{preview.outlet.name}</p>
                <h2 className="mt-1 font-mono text-xl font-bold text-[var(--ll-navy)]">
                  {preview.orderReference}
                </h2>
                {preview.customerName && (
                  <p className="mt-1 text-sm font-medium text-[var(--ll-slate)]">
                    Guest: {preview.customerName}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase text-emerald-800">
                Ready for handoff
              </span>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl bg-[#F4F6F7] p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--ll-muted)]">Handoff mode</p>
                <p className="font-semibold capitalize text-[var(--ll-navy)]">
                  {preview.handoffMode.replace("_", " ")}
                </p>
              </div>
              {preview.destinationHint && (
                <div>
                  <p className="text-xs text-[var(--ll-muted)]">Destination</p>
                  <p className="font-semibold text-[var(--ll-navy)]">{preview.destinationHint}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--ll-muted)]">Payment status</p>
                <p className="font-semibold text-emerald-700">Order paid · Settled</p>
              </div>
              <div>
                <p className="text-xs text-[var(--ll-muted)]">Total amount</p>
                <p className="ll-amount font-bold text-[var(--ll-navy)]">{money(preview.amount)}</p>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ll-muted)]">
                Items to hand over
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {preview.items.map((item, idx) => (
                  <li key={idx} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                    <span className="text-[var(--ll-slate)]">{item.itemName}</span>
                    <span className="font-semibold text-[var(--ll-navy)]">× {item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={loading}
                onClick={handleConfirm}
                className="ll-btn ll-btn-primary flex-1 min-h-12 text-base"
              >
                {loading ? "Confirming…" : "Confirm Received"}
              </button>
              <button
                disabled={loading}
                onClick={() => setPreview(null)}
                className="ll-btn ll-btn-secondary min-h-12"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Input & Scanner Modes */}
        {!preview && !successResult && (
          <div className="mt-7">
            {/* Tab navigation */}
            <div className="flex border-b border-[var(--ll-border)]">
              <button
                onClick={() => { setTab("scan"); setError(""); }}
                className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
                  tab === "scan"
                    ? "border-b-2 border-[var(--ll-navy)] text-[var(--ll-navy)]"
                    : "text-[var(--ll-muted)] hover:text-[var(--ll-slate)]"
                }`}
              >
                Scan QR
              </button>
              <button
                onClick={() => { setTab("manual"); stopCamera(); setError(""); }}
                className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
                  tab === "manual"
                    ? "border-b-2 border-[var(--ll-navy)] text-[var(--ll-navy)]"
                    : "text-[var(--ll-muted)] hover:text-[var(--ll-slate)]"
                }`}
              >
                Enter collection code
              </button>
              {isSupervisor && (
                <button
                  onClick={() => { setTab("exception"); stopCamera(); setError(""); }}
                  className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
                    tab === "exception"
                      ? "border-b-2 border-amber-600 text-amber-700"
                      : "text-[var(--ll-muted)] hover:text-amber-700"
                  }`}
                >
                  Supervisor exception
                </button>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <p className="font-semibold">Verification rejected</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {/* Scan Tab */}
            {tab === "scan" && (
              <section className="ll-panel mt-6 p-6 text-center">
                <p className="text-sm text-[var(--ll-muted)]">
                  Point the camera at the guest’s order QR code.
                </p>

                <div className="relative mx-auto mt-4 aspect-square max-w-sm overflow-hidden rounded-2xl bg-black">
                  <video
                    ref={videoRef}
                    className="size-full object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {cameraActive && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="size-48 rounded-xl border-2 border-emerald-400 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                    </div>
                  )}

                  {!cameraActive && (
                    <div className="absolute inset-0 grid place-items-center p-6 text-white/70">
                      <div>
                        <p className="text-sm">Camera inactive</p>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="ll-btn ll-btn-primary mt-4"
                        >
                          Start camera
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {cameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="ll-btn ll-btn-secondary mt-4"
                  >
                    Stop camera
                  </button>
                )}

                {cameraError && (
                  <div className="mt-4 rounded-xl bg-amber-50 p-4 text-left text-xs leading-5 text-amber-900 border border-amber-200">
                    <p className="font-bold">Camera note</p>
                    <p className="mt-1">{cameraError}</p>
                    <button
                      onClick={() => setTab("manual")}
                      className="mt-2 text-xs font-bold underline"
                    >
                      Switch to manual code entry
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Manual Code Entry Tab */}
            {tab === "manual" && (
              <section className="ll-panel mt-6 p-6">
                <label className="ll-label">
                  Collection code or token
                  <span className="ml-1 text-xs font-normal text-[var(--ll-muted)]">
                    (e.g. LLC1-A1B2C3D4E5F6A7B8C9D0 or LLQ1.token)
                  </span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter collection code"
                    className="ll-input mt-2 font-mono text-base uppercase"
                    autoFocus
                  />
                </label>
                <button
                  disabled={loading || !code.trim()}
                  onClick={() => void runPreview(code)}
                  className="ll-btn ll-btn-primary mt-4 w-full"
                >
                  {loading ? "Checking code…" : "Look up order"}
                </button>
              </section>
            )}

            {/* Supervisor Exception Tab */}
            {tab === "exception" && isSupervisor && (
              <form onSubmit={handleSupervisorException} className="ll-panel mt-6 p-6 border-amber-200 bg-amber-50/30">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Authorized Supervisor Override
                </p>
                <h2 className="mt-1 text-lg font-bold text-[var(--ll-navy)]">
                  Handoff exception without credential
                </h2>
                <p className="mt-2 text-xs leading-5 text-[var(--ll-muted)]">
                  Use this only when a customer has lost their phone or cannot retrieve their QR/code.
                  Every supervisor exception is logged in the permanent audit activity log.
                </p>

                <label className="ll-label mt-4">
                  Order reference
                  <input
                    value={exceptionOrderRef}
                    onChange={(e) => setExceptionOrderRef(e.target.value)}
                    placeholder="e.g. LL-M1A2B3-C4D5"
                    className="ll-input mt-2 font-mono"
                  />
                </label>

                <label className="ll-label mt-4">
                  Exception reason
                  <textarea
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    placeholder="e.g. Guest phone battery depleted; verified room 101 and guest surname Adebayo in person."
                    className="ll-input mt-2 min-h-24"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || !exceptionOrderRef.trim() || !exceptionReason.trim()}
                  className="ll-btn bg-amber-700 text-white hover:bg-amber-800 mt-5 w-full"
                >
                  {loading ? "Recording exception…" : "Authorize exception & complete handoff"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </StaffShell>
  );
}

export default function StaffVerifyPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-[var(--ll-muted)]">Loading verification…</div>}>
      <StaffVerifyContent />
    </Suspense>
  );
}
