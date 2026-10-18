"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FnbShell } from "@/components/fnb/FnbShell";
import { useFnb } from "@/components/fnb/FnbProvider";
import { getItem, money, outlets, type ModifierChoice } from "@/lib/fnb";

export default function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const dish = getItem(itemId);
  const router = useRouter();
  const { addItem } = useFnb();
  const [quantity, setQuantity] = useState(1);
  const [choices, setChoices] = useState<ModifierChoice[]>([]);
  const [notice, setNotice] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [added, setAdded] = useState(false);

  const currentDishId = dish?.id;
  const currentOutletId = dish?.outletId;

  useEffect(() => {
    if (!currentDishId || !currentOutletId) return;
    fetch(`/api/menu-availability?outlet=${currentOutletId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const current = data?.items?.find((item: { itemId: string }) => item.itemId === currentDishId);
        setAvailable(current?.available !== false);
      });
  }, [currentDishId, currentOutletId]);

  if (!dish) {
    return (
      <FnbShell backHref="/dining">
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="mt-4 font-serif text-2xl font-bold text-[#172B42]">Item Unavailable</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">
            The dish you requested is not currently on today&apos;s resort service menu.
          </p>
          <Link
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#172B42] px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-[#1E3858]"
            href="/dining"
          >
            <span>Return to dining</span>
          </Link>
        </div>
      </FnbShell>
    );
  }

  const activeDish = dish;
  const outlet = outlets.find((o) => o.id === activeDish.outletId);
  const selectedTotal =
    (activeDish.price + choices.reduce((sum, choice) => sum + choice.price, 0)) * quantity;

  function toggle(choice: ModifierChoice, groupRequired?: boolean) {
    setChoices((current) => {
      const exists = current.some((item) => item.id === choice.id);
      if (groupRequired) {
        return exists
          ? current.filter((item) => item.id !== choice.id)
          : [
              ...current.filter(
                (item) =>
                  !activeDish.modifiers?.some(
                    (group) => group.required && group.choices.some((option) => option.id === item.id)
                  )
              ),
              choice,
            ];
      }
      return exists ? current.filter((item) => item.id !== choice.id) : [...current, choice];
    });
  }

  function add() {
    if (available === false) {
      setNotice({ message: "This dish is currently sold out for the day.", type: "error" });
      return;
    }
    if (
      activeDish.modifiers?.some(
        (group) => group.required && !choices.some((choice) => group.choices.some((option) => option.id === choice.id))
      )
    ) {
      setNotice({ message: "Please choose your required preference before adding.", type: "error" });
      return;
    }
    if (!addItem(activeDish.id, quantity, choices)) {
      setNotice({
        message: "Your basket currently contains items from another outlet. Clear it or checkout first.",
        type: "error",
      });
      return;
    }

    setAdded(true);
    setNotice({ message: `Added ${quantity}× ${activeDish.name} to your basket!`, type: "success" });
    setTimeout(() => router.push("/dining/cart"), 600);
  }

  return (
    <FnbShell backHref={`/dining/menu?outlet=${activeDish.outletId}`} title={outlet?.name || "Menu"}>
      <div className="mx-auto max-w-3xl pb-24 sm:py-6">
        {/* Hero Card */}
        <div className="relative overflow-hidden bg-slate-900 shadow-sm sm:rounded-3xl border border-slate-200/80">
          <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full overflow-hidden">
            <img
              src={activeDish.image}
              alt={activeDish.name}
              className="h-full w-full object-cover"
            />
            {/* Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 pointer-events-none" />

            {/* Top Badges */}
            <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-2">
              <Link
                href={`/dining/menu?outlet=${activeDish.outletId}`}
                className="group inline-flex items-center gap-2 rounded-full bg-black/50 px-3.5 py-1.5 text-xs font-bold text-white/95 backdrop-blur-md border border-white/20 transition hover:bg-black/70"
              >
                <span>{outlet?.name}</span>
                <span className="text-white/40">/</span>
                <span className="text-slate-300">{activeDish.category}</span>
              </Link>

              {available === false ? (
                <span className="rounded-full bg-rose-600/95 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs backdrop-blur-md">
                  Sold Out
                </span>
              ) : activeDish.prepTime ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white/95 backdrop-blur-md border border-white/20">
                  <svg className="size-3.5 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{activeDish.prepTime}</span>
                </span>
              ) : null}
            </div>

            {/* Bottom Hero Tag */}
            {activeDish.tags?.[0] && available !== false && (
              <div className="absolute bottom-4 left-4 flex items-center rounded-full bg-black/60 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#E5C384] backdrop-blur-md border border-[#C5A56A]/40">
                <span>{activeDish.tags[0]}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dish Content Section */}
        <section className="px-5 pt-6 sm:px-2">
          {/* Category & Title Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#9A6510]">
              {activeDish.category}
            </span>
            {activeDish.tags && activeDish.tags.length > 1 && (
              <div className="flex gap-1.5">
                {activeDish.tags.slice(1).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Dish Title & Description */}
          <div className="mt-3">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#172B42] sm:text-4xl">
              {activeDish.name}
            </h1>
            <p className="mt-2 max-w-2xl text-base font-medium leading-relaxed text-slate-700">
              {activeDish.description}
            </p>
          </div>

          {/* Price & 3 Divisions side by side */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            {/* Portion Price Box */}
            <div className="flex shrink-0 items-center justify-between sm:flex-col sm:justify-center rounded-2xl border border-slate-200/90 bg-white px-5 py-3.5 sm:px-6 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Portion price
              </span>
              <span className="font-serif text-2xl font-bold text-[#172B42] sm:text-3xl sm:mt-0.5">
                {money(activeDish.price)}
              </span>
            </div>

            {/* 3 Divisions placed directly beside the price */}
            <div className="grid flex-1 grid-cols-3 gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-2.5 sm:p-3 text-center">
              <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                <span className="text-[#9A6510]">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span className="mt-1 text-[11px] font-bold text-slate-900">
                  {activeDish.prepTime || "15–20 mins"}
                </span>
                <span className="text-[10px] text-slate-500">Prepared fresh</span>
              </div>

              <div className="flex flex-col items-center justify-center border-x border-slate-200 p-1 sm:p-2">
                <span className="text-[#172B42]">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </span>
                <span className="mt-1 text-[11px] font-bold text-slate-900 truncate max-w-full px-1">
                  {outlet?.name}
                </span>
                <span className="text-[10px] text-slate-500">{outlet?.open}</span>
              </div>

              <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                <span className="text-emerald-700">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span className="mt-1 text-[11px] font-bold text-slate-900">Demo Order</span>
                <span className="text-[10px] text-slate-500">Simulated run</span>
              </div>
            </div>
          </div>

          {/* Chef's Craft & Sommelier Notes Card */}
          <div className="mt-6 space-y-4">
            {activeDish.chefNote && (
              <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/20 p-5 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#9A6510]">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span>Chef&apos;s Craft & Provenance</span>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
                  {activeDish.chefNote}
                </p>
              </div>
            )}

            {activeDish.pairing && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E3858] to-[#122336] text-[#E5C384]">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 01-6.23-.693L5 14.5" />
                    </svg>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#9A6510]">
                      Sommelier & Bar Pairing
                    </span>
                    <span className="text-sm font-bold text-[#172B42]">
                      {activeDish.pairing}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/dining/menu?outlet=${activeDish.outletId}`}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#9A6510] hover:bg-slate-200 transition"
                >
                  Explore Drinks →
                </Link>
              </div>
            )}
          </div>

          {/* Modifiers & Options Section */}
          {activeDish.modifiers?.map((group) => (
            <fieldset key={group.id} className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <legend className="px-1 text-sm font-bold text-[#172B42]">
                {group.name}
                {group.required && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-[#9A6510]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9A6510]">
                    Required
                  </span>
                )}
              </legend>
              <div className="mt-4 grid gap-3">
                {group.choices.map((choice) => {
                  const selected = choices.some((item) => item.id === choice.id);
                  return (
                    <button
                      type="button"
                      key={choice.id}
                      onClick={() => toggle(choice, group.required)}
                      className={`flex items-center justify-between rounded-xl p-4 text-left transition-all active:scale-[0.99] ${
                        selected
                          ? "border-2 border-[#172B42] bg-[#172B42]/[0.04] shadow-xs"
                          : "border border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex size-5 items-center justify-center rounded-full border transition-all ${
                            selected
                              ? "border-[#172B42] bg-[#172B42] text-white"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {selected && (
                            <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm font-bold text-[#172B42]">{choice.name}</span>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          selected ? "text-[#172B42]" : "text-slate-600"
                        }`}
                      >
                        {choice.price ? `+${money(choice.price)}` : "Included"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {/* Sticky/Floating Bottom Order Bar */}
          <div className="mt-8 rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Quantity Stepper */}
              <div className="flex items-center justify-between sm:justify-start gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 sm:hidden">
                  Quantity
                </span>
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 shadow-2xs">
                  <button
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={available === false}
                    className="flex size-10 items-center justify-center rounded-full bg-white text-base font-bold text-[#172B42] shadow-2xs transition hover:bg-slate-100 disabled:opacity-40 active:scale-95"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-serif text-base font-bold text-[#172B42]">
                    {quantity}
                  </span>
                  <button
                    aria-label="Increase quantity"
                    onClick={() => setQuantity(quantity + 1)}
                    disabled={available === false}
                    className="flex size-10 items-center justify-center rounded-full bg-white text-base font-bold text-[#172B42] shadow-2xs transition hover:bg-slate-100 disabled:opacity-40 active:scale-95"
                  >
                    +
                  </button>
                </div>

                <div className="hidden sm:block pl-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Calculated Total
                  </span>
                  <span className="font-serif text-lg font-bold text-[#172B42]">
                    {money(selectedTotal)}
                  </span>
                </div>
              </div>

              {/* Add CTA */}
              <button
                disabled={available === false || added}
                onClick={add}
                className={`flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold shadow-sm transition-all active:scale-98 ${
                  added
                    ? "bg-emerald-600 text-white"
                    : available === false
                    ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#172B42] via-[#1E3858] to-[#122336] text-white hover:from-[#9A6510] hover:to-[#C5A56A] hover:shadow-md"
                }`}
              >
                {added ? (
                  <>
                    <svg className="size-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>Added to Basket!</span>
                  </>
                ) : available === false ? (
                  <span>Sold Out Today</span>
                ) : (
                  <>
                    <svg className="size-4 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <span>Add to Basket ({money(selectedTotal)})</span>
                  </>
                )}
              </button>
            </div>

            {notice && (
              <div
                role="status"
                className={`mt-4 flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-bold ${
                  notice.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <span>{notice.message}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </FnbShell>
  );
}
