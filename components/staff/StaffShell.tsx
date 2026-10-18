"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const primary = [
  [
    "/staff",
    "Queue",
    <svg key="q" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>,
  ],
  [
    "/staff/kitchen",
    "Kitchen",
    <svg key="k" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
    </svg>,
  ],
  [
    "/staff/menu",
    "Menu",
    <svg key="m" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>,
  ],
  [
    "/staff/transactions",
    "Transactions",
    <svg key="t" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>,
  ],
] as const;

const secondary = [
  [
    "/staff/verify",
    "Verify handoff",
    <svg key="v" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
    </svg>,
  ],
] as const;

const extra = [
  [
    "/staff/approvals",
    "Approvals",
    <svg key="ap" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>,
  ],
  [
    "/management",
    "Management Suite",
    <svg key="mg" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>,
  ],
] as const;

export function staffSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("lakowe-staff-session") || "null") as { id: string; name: string; role: string; outlets?: string[] } | null;
  } catch {
    return null;
  }
}

export function useStaffSession() {
  const [session, setSession] = useState<ReturnType<typeof staffSession>>(null);
  useEffect(() => setSession(staffSession()), []);
  return session;
}

export function StaffShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    user = useStaffSession(),
    supervisor = user?.role === "supervisor";

  const allItems = [...primary, ...secondary, ...extra];
  const currentTitle = allItems.find(([href]) => href === path)?.[1] || "F&B Operations";

  const link = (href: string, label: string, icon: React.ReactNode) => {
    const active = path === href;
    return (
      <Link
        href={href}
        className={
          "flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all " +
          (active
            ? "bg-gradient-to-r from-[#C5A56A] to-[#D4B36E] text-[#0F172A] font-bold shadow-xs"
            : "text-slate-100 hover:bg-white/10 hover:text-white")
        }
      >
        <span
          aria-hidden="true"
          className={`flex size-5 shrink-0 items-center justify-center ${
            active ? "text-[#0F172A]" : "text-[#C5A56A]"
          }`}
        >
          {icon}
        </span>
        <span>{label}</span>
      </Link>
    );
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "ST";

  return (
    <div className="staff-app min-h-screen bg-[var(--ll-warm-white)] text-[var(--ll-slate)] md:grid md:grid-cols-[260px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden flex-col justify-between border-r border-slate-800 bg-[#112032] p-6 text-white md:flex min-h-screen">
        <div>
          <Link href="/staff" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-sm font-bold text-[#E5C384] shadow-sm">
              LL
            </span>
            <div>
              <p className="text-sm font-bold leading-tight tracking-tight text-white">Lakowe Lakes</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A56A]">
                F&B Operations
              </p>
            </div>
          </Link>

          <nav aria-label="Staff operations" className="mt-8 space-y-1.5">
            {primary.map(([h, l, i]) => (
              <div key={h}>{link(h, l, i)}</div>
            ))}
            <div className="pt-3 border-t border-white/10 space-y-1.5">
              {secondary.map(([h, l, i]) => (
                <div key={h}>{link(h, l, i)}</div>
              ))}
            </div>
            {supervisor && (
              <div className="pt-3 border-t border-white/10 space-y-1.5">
                {extra.map(([h, l, i]) => (
                  <div key={h}>{link(h, l, i)}</div>
                ))}
              </div>
            )}
          </nav>
        </div>

        <div className="mt-8 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 border border-white/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C5A56A] font-bold text-xs text-[#112032]">
              {userInitials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{user?.name || "Staff User"}</p>
              <p className="text-[10px] font-medium text-emerald-400">
                {user?.role ? `${user.role} · On Duty` : "On Duty"}
              </p>
            </div>
            <button
              onClick={() => {
                void fetch("/api/demo/session", { method: "DELETE" });
                localStorage.removeItem("lakowe-staff-session");
                router.push("/staff/login");
              }}
              title="Sign out"
              className="text-xs font-semibold text-slate-300 hover:text-white"
            >
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Navbar */}
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-slate-800 bg-[#112032] px-4 py-2.5 text-white shadow-md md:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384]">
            LL
          </span>
          <div>
            <b className="text-sm font-bold text-white block">{user?.name || "Operations"}</b>
            <span className="text-[10px] font-semibold text-[#C5A56A] block">{user?.role || "Staff"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/staff/verify"
            className="flex items-center gap-1.5 rounded-xl bg-[#C5A56A] px-3 py-1.5 text-xs font-bold text-[#152018] shadow-xs active:scale-95 hover:bg-[#B39358]"
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span>Scan handoff</span>
          </Link>
          {supervisor && (
            <Link
              href="/staff/approvals"
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white"
            >
              Approvals
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-col min-w-0">
        {/* Desktop Top Navbar */}
        <header className="hidden md:flex items-center justify-between border-b border-slate-200 bg-white/95 px-8 py-3.5 backdrop-blur-md shadow-2xs sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9A6510]">F&B Operations</span>
            <span className="text-slate-300 font-bold">/</span>
            <h1 className="text-sm font-bold text-[#172B42]">{currentTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/staff/verify"
              className="flex items-center gap-1.5 rounded-xl bg-[#C5A56A] px-3.5 py-1.5 text-xs font-bold text-[#152018] shadow-xs hover:bg-[#B39358] transition active:scale-95"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span>Scan Handoff</span>
            </Link>
            {supervisor && (
              <Link
                href="/management"
                className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#172B42] shadow-2xs transition hover:border-[#C5A56A] hover:bg-slate-100 hover:text-[#9A6510]"
              >
                <span>Management Suite</span>
                <svg className="size-3 text-slate-400 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#9A6510]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </Link>
            )}
            <Link
              href="/dining"
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#172B42] shadow-2xs transition hover:border-[#C5A56A] hover:bg-slate-100 hover:text-[#9A6510]"
            >
              <span>Guest Dining</span>
              <svg className="size-3 text-slate-400 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#9A6510]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </Link>
          </div>
        </header>

        <main className="min-w-0 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8 flex-1">{children}</main>
      </div>

      {/* Mobile Bottom Bar */}
      <nav
        aria-label="Staff mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 p-2 backdrop-blur-md md:hidden shadow-lg"
      >
        {primary.map(([h, l, i]) => {
          const active = path === h;
          return (
            <Link
              key={h}
              href={h}
              className={
                "flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl text-xs font-bold transition-all px-3 " +
                (active ? "bg-[#172B42] text-white shadow-xs" : "text-slate-700 hover:text-slate-900")
              }
            >
              <span aria-hidden="true" className={active ? "text-[#C5A56A]" : "text-slate-600"}>
                {i}
              </span>
              <span className="mt-1 font-semibold">{l}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}