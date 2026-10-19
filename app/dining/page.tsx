"use client";

import Link from "next/link";
import { DiningNav, FnbShell } from "@/components/fnb/FnbShell";
import { menuItems, outlets } from "@/lib/fnb";
import { ACTIVE_OUTLET_ID } from "@/lib/clubhouse-config";

export default function DiningHome() {
  return (
    <FnbShell>
      <section className="ll-container py-8 sm:py-12">
        {/* Hero Section */}
        <div className="max-w-xl">
          <div className="inline-flex items-center rounded-full bg-[#9A6510]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#9A6510]">
            Dining & Lounges
          </div>
          <h1 className="mt-2.5 font-serif text-2xl font-bold tracking-tight text-[#172B42] sm:text-3xl lg:text-4xl">
            Thoughtful dining by the lake.
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
            Order fresh food and drinks at The Clubhouse.
          </p>
        </div>

        {/* Outlet Cards Grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {outlets.filter((o) => o.id === ACTIVE_OUTLET_ID).map((o) => {
            const count = menuItems.filter((m) => m.outletId === o.id).length;
            return (
              <Link
                key={o.id}
                href={"/dining/menu?outlet=" + o.id}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-[#C5A56A]/60 hover:shadow-xl"
              >
                {/* Hero Image Section */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
                  <img
                    src={o.image}
                    alt={o.name}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Vignette Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25 pointer-events-none" />

                  {/* Top Floating Badges */}
                  <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#172B42] shadow-xs backdrop-blur-md">
                      {o.type}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white/95 shadow-xs backdrop-blur-md border border-white/10">
                      <span>{o.open}</span>
                    </span>
                  </div>

                  {/* Bottom Counter Pill on Image */}
                  <div className="absolute bottom-3 left-3.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-md border border-white/10">
                    <svg className="size-3 text-[#E5C384]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <span>{count} dishes available</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                  <div>
                    <h2 className="font-serif text-2xl font-bold tracking-tight text-[#172B42] transition-colors duration-200 group-hover:text-[#9A6510]">
                      {o.name}
                    </h2>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                      {o.description}
                    </p>
                  </div>

                  {/* Card Bottom CTA */}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold text-slate-600">
                      View kitchen offerings
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#172B42] to-[#1E3858] px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all duration-200 group-hover:from-[#9A6510] group-hover:to-[#C5A56A] group-hover:shadow-sm">
                      <span>View menu</span>
                      <svg
                        className="size-3.5 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Demo Notice Panel */}
        <aside className="mt-10 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#9A6510]/15 text-[#9A6510]">
              <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
            <div className="text-xs font-medium leading-relaxed text-slate-700">
              <b className="font-bold text-[#172B42]">Demo ordering environment:</b> All room charges, simulated card transactions, and order verification steps run entirely in guest demonstration mode. No live payment gateways or external hotel property management systems are charged.
            </div>
          </div>
        </aside>
      </section>
      <DiningNav />
    </FnbShell>
  );
}