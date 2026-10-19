"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { FnbShell } from "@/components/fnb/FnbShell";
import { menuItems, money, outlets, type MenuItem } from "@/lib/fnb";
import { ACTIVE_OUTLET_ID } from "@/lib/clubhouse-config";

type Availability = Record<string, boolean>;

function MenuContent() {
  const p = useSearchParams();
  const requestedOutlet = p.get("outlet");
  const id = ACTIVE_OUTLET_ID;
  const outlet = outlets.find((x) => x.id === id) || outlets[2];
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [availability, setAvailability] = useState<Availability>({});

  useEffect(() => {
    fetch("/api/menu-availability?outlet=" + outlet.id, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) {
          setAvailability(
            Object.fromEntries(
              d.items.map((x: { itemId: string; available: boolean }) => [x.itemId, x.available])
            )
          );
        }
      });
  }, [outlet.id]);

  const outletItems = useMemo(
    () => menuItems.filter((x) => x.outletId === outlet.id),
    [outlet.id]
  );

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(outletItems.map((x) => x.category)))],
    [outletItems]
  );

  const dishes = useMemo(
    () =>
      outletItems.filter(
        (x) =>
          (cat === "All" || x.category === cat) &&
          (x.name + " " + x.description + " " + (x.tags?.join(" ") || "")).toLowerCase().includes(q.toLowerCase())
      ),
    [outletItems, cat, q]
  );

  return (
    <FnbShell backHref="/dining" title="All dining">
      <section className="ll-container py-6 sm:py-9">
        {requestedOutlet && requestedOutlet !== ACTIVE_OUTLET_ID && <p role="status" className="ll-alert ll-status-info mb-4">This demo now accepts new orders at The Clubhouse only.</p>}
        {/* Outlet Header Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-amber-50/20 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center rounded-full bg-[#9A6510]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#9A6510]">
                {outlet.type}
              </span>
              <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#172B42] sm:text-4xl">
                {outlet.name}
              </h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                {outlet.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                Kitchen Active: {outlet.open}
              </span>
              <span className="text-xs font-medium text-slate-600">
                {outletItems.length} curated dishes
              </span>
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-6 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs transition-all focus-within:border-[#C5A56A] focus-within:ring-2 focus-within:ring-[#C5A56A]/20">
            <svg className="size-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search dishes, ingredients, or pairings…"
              className="ml-3 w-full bg-transparent text-sm font-medium text-[#172B42] placeholder:text-slate-600 outline-none"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="text-xs font-bold text-slate-600 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>

          {/* Categories Pill Scroller */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((c) => {
              const active = cat === c;
              const count = c === "All" ? outletItems.length : outletItems.filter((x) => x.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
                    active
                      ? "bg-[#172B42] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span>{c}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Cards Grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((d: MenuItem) => {
            const sold = availability[d.id] === false;
            return (
              <article
                key={d.id}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-[#C5A56A]/60 hover:shadow-xl"
              >
                {/* Image Section with overlays */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <img
                    src={d.image}
                    alt={d.name}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Subtle vignette overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                  {/* Top floating badges */}
                  <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#172B42] shadow-xs backdrop-blur-md">
                      {d.category}
                    </span>
                    {sold ? (
                      <span className="rounded-full bg-rose-600/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-xs backdrop-blur-md">
                        Sold Out
                      </span>
                    ) : d.prepTime ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 shadow-xs backdrop-blur-md border border-white/10">
                        <svg className="size-3 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{d.prepTime}</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Bottom Image Tag (e.g., Chef's Signature) */}
                  {d.tags?.[0] && !sold && (
                    <div className="absolute bottom-3 left-3.5 flex items-center rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E5C384] backdrop-blur-md border border-[#C5A56A]/30">
                      <span>{d.tags[0]}</span>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                  <div>
                    <h2 className="font-serif text-lg font-bold leading-snug text-[#172B42] transition-colors group-hover:text-[#9A6510] sm:text-xl line-clamp-1">
                      {d.name}
                    </h2>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600 sm:text-sm line-clamp-2">
                      {d.description}
                    </p>

                    {/* Subtle culinary pairing badge if available */}
                    {d.pairing && (
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <svg className="size-3 text-[#9A6510] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 01-6.23-.693L5 14.5" />
                        </svg>
                        <span className="truncate">Pairs with: <b className="font-semibold text-slate-700">{d.pairing}</b></span>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom: Price & CTA */}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Price
                      </span>
                      <span className="font-serif text-lg font-bold text-[#172B42] sm:text-xl">
                        {money(d.price)}
                      </span>
                    </div>

                    {sold ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600">
                        Unavailable
                      </span>
                    ) : (
                      <Link
                        href={"/dining/menu/" + d.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#172B42] to-[#1E3858] px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition-all duration-200 group-hover:from-[#9A6510] group-hover:to-[#C5A56A] group-hover:shadow-sm active:scale-95"
                      >
                        <span>View dish</span>
                        <svg
                          className="size-3.5 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Empty state */}
        {!dishes.length && (
          <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <h2 className="mt-4 font-serif text-xl font-bold text-[#172B42]">No matching dishes</h2>
            <p className="mt-2 text-sm font-medium text-slate-600">
              We couldn’t find any dish matching &quot;{q}&quot; in {cat === "All" ? "this menu" : cat}.
            </p>
            <button
              onClick={() => {
                setQ("");
                setCat("All");
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-[#172B42] hover:bg-slate-200 transition"
            >
              Reset filters
            </button>
          </div>
        )}
      </section>
    </FnbShell>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<main className="ll-page min-h-screen" />}>
      <MenuContent />
    </Suspense>
  );
}