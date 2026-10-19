"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FnbShell } from "@/components/fnb/FnbShell";
import { useFnb } from "@/components/fnb/FnbProvider";
import { cartTotal, getItem, money, outlets, HANDOFF_MODES, type DemoOrder, type HandoffMode } from "@/lib/fnb";
import { OPERA_DEMO_SCENARIOS } from "@/lib/opera-demo-adapter";
import type { OperaAttemptResult } from "@/lib/opera-room-charge";

type PaymentMethod = "demo" | "wallet" | "opera";
const handoffConfig: Record<HandoffMode, { title: string; desc: string; destLabel: string; placeholder: string; outlets: string[] }> = {
  counter: {
    title: "Counter pickup",
    desc: "Collect from the service counter when ready.",
    destLabel: "",
    placeholder: "",
    outlets: ["clubhouse", "winebar", "revivo", "restaurant-18"],
  },
  table: {
    title: "Table delivery",
    desc: "Delivered directly to your table at the outlet.",
    destLabel: "Table number",
    placeholder: "e.g. Table 12",
    outlets: ["clubhouse", "restaurant-18"],
  },
  room: {
    title: "Room / Cottage delivery",
    desc: "Delivered to your Lakowe Lakes accommodation.",
    destLabel: "Room or cottage number",
    placeholder: "e.g. 101 or Cottage 4",
    outlets: ["clubhouse", "restaurant-18"],
  },
  golf_course: {
    title: "Golf course delivery",
    desc: "Delivered to your group on the championship course.",
    destLabel: "Hole or course zone",
    placeholder: "e.g. Hole 7 green or Driving range",
    outlets: ["clubhouse", "winebar"],
  },
};

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const outletId = params.get("outlet") || "";
  const outlet = outlets.find(item => item.id === outletId);
  const { cart, checkout, ready, rememberOrder } = useFnb();
  const outletCart = useMemo(() => cart.filter(item => getItem(item.itemId)?.outletId === outletId), [cart, outletId]);
  const otherItemsCount = cart.length - outletCart.length;
  const [name, setName] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("demo");
  const [handoffMode, setHandoffMode] = useState<HandoffMode>("counter");
  const [destination, setDestination] = useState("");
  const [roomReference, setRoomReference] = useState("");
  const [guestSurname, setGuestSurname] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [operaResult, setOperaResult] = useState<OperaAttemptResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const submitting = useRef(false);
  const walletKey = useRef("");
  const operaKey = useRef("");
  const total = cartTotal(outletCart);

  const availableModes = HANDOFF_MODES.filter(mode => handoffConfig[mode].outlets.includes(outletId));

  useEffect(() => {
    fetch("/api/wallet").then(response => response.ok ? response.json() : null).then(data => setWalletBalance(data?.balance ?? null));
  }, []);

  function updateOpera(field: "room" | "surname" | "code", value: string) {
    if (field === "room") {
      setRoomReference(value);
      if (handoffMode === "room" && !destination) setDestination(`Room ${value}`);
    }
    if (field === "surname") setGuestSurname(value);
    if (field === "code") setVerificationCode(value);
    operaKey.current = "";
    setOperaResult(null);
    setError("");
  }

  async function checkOperaStatus() {
    if (!operaKey.current || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/opera/room-charge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", idempotencyKey: operaKey.current }) });
      const result = await response.json() as OperaAttemptResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "The simulated posting status is unavailable.");
      setOperaResult(result);
      if (result.outcome === "confirmed" && result.order) {
        rememberOrder(result.order, outletId);
        window.location.assign(`/dining/orders/${result.order.reference}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The simulated posting status is unavailable."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim()) { setError("Please add your name for this demo order."); return; }
    if (handoffMode !== "counter" && !destination.trim() && !(method === "opera" && roomReference.trim())) {
      setError(`Please provide your ${handoffConfig[handoffMode].destLabel.toLowerCase()}.`);
      return;
    }

    const effectiveDestination = handoffMode === "counter" ? undefined : (destination.trim() || (method === "opera" ? roomReference.trim() : undefined));

    if (method === "wallet") {
      submitting.current = true; setBusy(true); setError("");
      walletKey.current ||= crypto.randomUUID();
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          outletId,
          customerName: name,
          items: outletCart,
          idempotencyKey: walletKey.current,
          handoffMode,
          destination: effectiveDestination,
        }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Wallet payment could not be completed."); setBusy(false); submitting.current = false; return; }
      const guestOrder: DemoOrder = result.verification
        ? {
            ...result.order,
            verification: {
              token: result.verification.token,
              collectionCode: result.verification.collectionCode,
              handoffMode: result.verification.verification.handoffMode,
              expiresAt: result.verification.verification.expiresAt,
            },
          }
        : result.order;
      rememberOrder(guestOrder, outletId);
      if (result.credentialRecoveryUnavailable) setError("Your payment was already recorded, but this device cannot safely recover the original handoff code.");
      router.replace(`/dining/orders/${result.order.reference}`);
      return;
    }

    if (method === "opera") {
      if (!roomReference.trim() || !guestSurname.trim() || !verificationCode.trim()) {
        setError("Enter the fictional room, guest surname and verification code.");
        return;
      }
      submitting.current = true; setBusy(true); setError("");
      operaKey.current ||= crypto.randomUUID();
      try {
        const response = await fetch("/api/opera/room-charge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "checkout",
            outletId,
            customerName: name,
            items: outletCart,
            roomReference,
            guestSurname,
            verificationCode,
            idempotencyKey: operaKey.current,
            handoffMode,
            destination: effectiveDestination,
          }),
        });
        const result = await response.json() as OperaAttemptResult & { error?: string };
        if (!response.ok) throw new Error(result.error || "The simulated room charge could not be processed.");
        setOperaResult(result);
        if (result.outcome === "confirmed" && result.order) {
          const guestOrder: DemoOrder = result.verification
            ? {
                ...result.order,
                verification: {
                  token: result.verification.token,
                  collectionCode: result.verification.collectionCode,
                  handoffMode: result.verification.verification.handoffMode,
                  expiresAt: result.verification.verification.expiresAt,
                },
              }
            : result.order;
          rememberOrder(guestOrder, outletId);
          window.location.assign(`/dining/orders/${result.order.reference}`);
          return;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The simulated room charge could not be processed.");
      }
      setBusy(false); submitting.current = false;
      return;
    }

    submitting.current = true; setBusy(true); setError("");
    let order: DemoOrder | null = null;
    try {
      order = await checkout(outletId, name, handoffMode, effectiveDestination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your basket could not be checked out.");
      setBusy(false); submitting.current = false;
      return;
    }
    if (!order) {
      setError("Your basket has changed. Return to your basket and try again.");
      setBusy(false); submitting.current = false;
      return;
    }
    router.replace(`/dining/orders/${order.reference}`);
  }

  if (!ready)
    return (
      <FnbShell backHref="/dining/cart" title="Basket">
        <div className="mx-auto max-w-md px-5 py-20 text-center">
          <p className="text-sm font-medium text-[var(--ll-muted)]">Loading your basket…</p>
        </div>
      </FnbShell>
    );

  if (!outletCart.length || !outlet)
    return (
      <FnbShell backHref="/dining/cart" title="Basket">
        <div className="mx-auto max-w-md px-5 py-20 text-center">
          <h1 className="ll-section-title text-2xl">There is nothing to check out.</h1>
          <Link href="/dining" className="ll-btn ll-btn-primary mt-6">
            Browse outlets
          </Link>
        </div>
      </FnbShell>
    );

  return (
    <FnbShell backHref="/dining/cart" title="Basket">
      <form onSubmit={submit} className="ll-container max-w-2xl px-5 py-8">
        <p className="ll-eyebrow">Checkout · simulated</p>
        <h1 className="ll-page-title mt-2">Confirm your order.</h1>

        <section className="ll-panel mt-6 p-6">
          <h2 className="ll-section-title text-base">Order for {outlet.name}</h2>
          <label className="ll-label mt-4">
            Your name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Tunde Adeyemi"
              className="ll-input mt-1.5"
            />
          </label>
        </section>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold text-[var(--ll-navy)]">
            How would you like to receive your food?
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {availableModes.map((mode) => {
              const config = handoffConfig[mode];
              const selected = handoffMode === mode;
              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => {
                    setHandoffMode(mode);
                    setError("");
                  }}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? "border-[var(--ll-navy)] bg-[var(--ll-navy)]/[.04] shadow-sm"
                      : "border-[var(--ll-border)] bg-white hover:border-[var(--ll-gold)]"
                  }`}
                >
                  <div>
                    <b
                      className={`block text-sm ${
                        selected ? "text-[var(--ll-navy)] font-bold" : "text-[var(--ll-slate)] font-semibold"
                      }`}
                    >
                      {config.title}
                    </b>
                    <span className="mt-1 block text-xs leading-5 text-[var(--ll-muted)]">
                      {config.desc}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <span
                      className={`size-3.5 rounded-full border-2 ${
                        selected
                          ? "border-[var(--ll-navy)] bg-[var(--ll-navy)]"
                          : "border-[var(--ll-border)] bg-white"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {handoffMode !== "counter" && (
            <div className="mt-4 rounded-xl border border-[var(--ll-border)] bg-white p-4">
              <label className="ll-label text-xs font-semibold">
                {handoffConfig[handoffMode].destLabel}
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={handoffConfig[handoffMode].placeholder}
                  className="ll-input mt-1.5"
                />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold text-[var(--ll-navy)]">Choose payment method</legend>
          <div className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => {
                setMethod("demo");
                setError("");
              }}
              className={`flex w-full items-start justify-between rounded-xl border p-4 text-left transition-all ${
                method === "demo"
                  ? "border-[var(--ll-navy)] bg-[var(--ll-navy)]/[.04] shadow-sm"
                  : "border-[var(--ll-border)] bg-white hover:border-[var(--ll-gold)]"
              }`}
            >
              <span>
                <b className="block text-sm font-bold text-[var(--ll-navy)]">Pay now (Demo)</b>
                <span className="mt-1 block text-xs leading-5 text-[var(--ll-muted)]">
                  Test confirmation only. No card or real money is charged.
                </span>
              </span>
              <span
                className={`mt-1 size-4 rounded-full border-4 ${
                  method === "demo" ? "border-[var(--ll-navy)]" : "border-[var(--ll-border)] bg-white"
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod("wallet");
                setError("");
              }}
              className={`flex w-full items-start justify-between rounded-xl border p-4 text-left transition-all ${
                method === "wallet"
                  ? "border-[var(--ll-navy)] bg-[var(--ll-navy)]/[.04] shadow-sm"
                  : "border-[var(--ll-border)] bg-white hover:border-[var(--ll-gold)]"
              }`}
            >
              <span>
                <b className="block text-sm font-bold text-[var(--ll-navy)]">Golfer wallet</b>
                <span className="mt-1 block text-xs leading-5 text-[var(--ll-muted)]">
                  Available balance:{" "}
                  {walletBalance === null ? "Loading…" : money(walletBalance)}. Remaining after order:{" "}
                  {walletBalance === null ? "..." : money(walletBalance - total)}.
                </span>
              </span>
              <span className="rounded-full bg-[var(--ll-gold)]/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ll-navy)]">
                Demo
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod("opera");
                setError("");
              }}
              className={`flex w-full items-start justify-between rounded-xl border p-4 text-left transition-all ${
                method === "opera"
                  ? "border-[var(--ll-navy)] bg-[var(--ll-navy)]/[.04] shadow-sm"
                  : "border-[var(--ll-border)] bg-white hover:border-[var(--ll-gold)]"
              }`}
            >
              <span>
                <b className="block text-sm font-bold text-[var(--ll-navy)]">
                  Charge to room (Demo)
                </b>
                <span className="mt-1 block text-xs leading-5 text-[var(--ll-muted)]">
                  Simulated hotel folio posting. Verifies room occupancy and guest surname.
                </span>
              </span>
              <span className="rounded-full bg-[var(--ll-silver)] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ll-slate)]">
                Simulated
              </span>
            </button>
          </div>
        </fieldset>

        {method === "opera" && (
          <section className="ll-panel mt-6 p-6">
            <p className="ll-eyebrow text-[var(--ll-gold)]">Fictional stay verification</p>
            <h2 className="ll-section-title text-base mt-1">Hotel guest verification</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--ll-muted)]">
              This demo checks occupancy, guest surname, a fictional verification code, and room-charge permission before attempting a posting.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="ll-label text-xs">
                Room
                <input
                  aria-label="Demo room"
                  value={roomReference}
                  onChange={(event) => updateOpera("room", event.target.value)}
                  placeholder="101"
                  inputMode="numeric"
                  className="ll-input mt-1.5"
                />
              </label>
              <label className="ll-label text-xs">
                Guest surname
                <input
                  aria-label="Demo guest surname"
                  value={guestSurname}
                  onChange={(event) => updateOpera("surname", event.target.value)}
                  placeholder="Adebayo"
                  className="ll-input mt-1.5"
                />
              </label>
              <label className="ll-label text-xs">
                Verification code
                <input
                  aria-label="Demo verification code"
                  value={verificationCode}
                  onChange={(event) => updateOpera("code", event.target.value)}
                  placeholder="LAKE-101"
                  className="ll-input mt-1.5 uppercase"
                />
              </label>
            </div>
            <details className="ll-panel-muted mt-4 p-4">
              <summary className="cursor-pointer text-xs font-bold text-[var(--ll-navy)]">
                Show fictional demo scenarios
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {OPERA_DEMO_SCENARIOS.map((scenario) => (
                  <button
                    type="button"
                    key={scenario.roomReference}
                    onClick={() => {
                      setRoomReference(scenario.roomReference);
                      setGuestSurname(scenario.guestSurname);
                      setVerificationCode(scenario.verificationCode);
                      if (handoffMode === "room") setDestination(`Room ${scenario.roomReference}`);
                      operaKey.current = "";
                      setOperaResult(null);
                    }}
                    className="rounded-lg border border-[var(--ll-border)] bg-white p-3 text-left hover:border-[var(--ll-gold)]"
                  >
                    <b className="text-xs font-bold text-[var(--ll-navy)]">
                      Room {scenario.roomReference} · {scenario.guestSurname}
                    </b>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--ll-muted)]">
                      {scenario.verificationCode}
                    </span>
                    <span className="mt-1 block text-[10px] font-semibold text-[var(--ll-gold)]">
                      {scenario.outcome}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          </section>
        )}

        <section className="ll-panel mt-6 p-6">
          <div className="flex justify-between text-sm text-[var(--ll-muted)]">
            <span>Items ({outletCart.reduce((sum, line) => sum + line.quantity, 0)})</span>
            <span className="ll-amount font-semibold text-[var(--ll-slate)]">{money(total)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-[var(--ll-border)] pt-3 text-lg font-bold text-[var(--ll-navy)]">
            <span>Total</span>
            <span className="ll-amount text-xl text-[var(--ll-navy)]">{money(total)}</span>
          </div>
        </section>

        {otherItemsCount > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200/90 bg-amber-50/70 p-4 text-xs font-medium text-amber-900 shadow-2xs">
            <p className="font-bold">Dishes from other venue(s) are saved</p>
            <p className="mt-1 text-[11px] text-amber-800">
              You are checking out items for <b>{outlet.name}</b>. Your remaining dishes from other venues will stay safely in your basket.
            </p>
          </div>
        )}

        {operaResult && (
          <section
            data-testid="opera-checkout-result"
            className={`mt-4 rounded-xl border p-4 ${
              operaResult.outcome === "pending"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            <p className="text-sm font-bold">
              {operaResult.outcome === "pending" ? "Posting result waiting" : "Room charge not completed"}
            </p>
            <p className="mt-2 text-sm leading-6">
              {operaResult.attempt.failureReason || "The simulated posting was not confirmed."}
            </p>
            <p className="mt-2 font-mono text-xs opacity-75">
              {operaResult.attempt.orderReference} · {operaResult.attempt.roomReferenceMasked}
            </p>
            {operaResult.outcome === "pending" && (
              <>
                <p className="mt-3 text-xs font-semibold">
                  Do not resubmit this charge. A supervisor can match and check the result from OPERA Demo monitoring.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void checkOperaStatus()}
                  className="ll-btn ll-btn-secondary mt-3 text-xs"
                >
                  Check saved status
                </button>
              </>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="ll-alert ll-status-error mt-4">
            {error}
          </p>
        )}

        <button
          disabled={busy || (method === "opera" && operaResult?.outcome === "pending")}
          className="ll-btn ll-btn-primary mt-6 w-full text-base py-3.5"
        >
          {busy
            ? "Processing order…"
            : method === "opera"
            ? `Verify and charge room · ${money(total)}`
            : `Place order · ${money(total)}`}
        </button>
      </form>
    </FnbShell>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<main className="ll-page min-h-screen" />}><CheckoutContent /></Suspense>;
}
