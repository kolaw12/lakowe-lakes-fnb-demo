"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const groups = [
  [
    "Action Center",
    [
      [
        "/management",
        "Action Center",
        <svg key="ac" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>,
      ],
      [
        "/management/exceptions",
        "Exceptions",
        <svg key="ex" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>,
      ],
      [
        "/staff/approvals",
        "Approvals",
        <svg key="ap" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>,
      ],
    ],
  ],
  [
    "Financial Performance",
    [
      [
        "/management/reports",
        "Reports",
        <svg key="rp" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>,
      ],
    ],
  ],
  [
    "Controls & Accountability",
    [
      [
        "/management/overrides",
        "Overrides",
        <svg key="ov" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>,
      ],
      [
        "/management/audit",
        "Activity log",
        <svg key="al" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>,
      ],
    ],
  ],
  [
    "Integrations",
    [
      [
        "/management/opera",
        "OPERA simulation",
        <svg key="op" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>,
      ],
      [
        "/management/sage",
        "Sage 200 simulation",
        <svg key="sg" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>,
      ],
    ],
  ],
] as const;

export function ManagementShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  let currentTitle = "Management Suite";
  for (const [, links] of groups) {
    for (const [href, label] of links) {
      if (href === path) {
        currentTitle = label;
        break;
      }
    }
  }

  const navLinks = () => (
    <nav aria-label="Management navigation" className="mt-6 space-y-6">
      {groups.map(([groupName, links]) => (
        <section key={groupName}>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#C5A56A]">
            {groupName}
          </p>
          <div className="space-y-1">
            {links.map(([href, label, icon]) => {
              const active = path === href;
              return (
                <Link
                  onClick={() => setOpen(false)}
                  key={href}
                  href={href}
                  className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
                    active
                      ? "bg-gradient-to-r from-[#C5A56A] to-[#D4B36E] text-[#0F172A] font-bold shadow-xs"
                      : "text-slate-100 font-semibold hover:bg-white/10 hover:text-white"
                  }`}
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
            })}
          </div>
        </section>
      ))}
    </nav>
  );

  const userInitials = userName
    ? userName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "MG";

  return (
    <div className="management-app min-h-screen bg-[var(--ll-warm-white)] text-[var(--ll-slate)] lg:grid lg:grid-cols-[280px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden flex-col justify-between border-r border-slate-800 bg-[#112032] p-6 text-white lg:flex min-h-screen">
        <div>
          <Link href="/management" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-sm font-bold text-[#E5C384] shadow-sm">
              LL
            </span>
            <div>
              <p className="text-sm font-bold leading-tight tracking-tight text-white">Lakowe Lakes</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A56A]">
                Management Suite
              </p>
            </div>
          </Link>
          {navLinks()}
        </div>

        {/* User Card */}
        <div className="mt-8 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 border border-white/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C5A56A] font-bold text-xs text-[#112032]">
              {userInitials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{userName}</p>
              <p className="text-[10px] font-medium text-emerald-400">
                Supervisor · Active
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
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-slate-800 bg-[#112032] px-4 py-2.5 text-white shadow-md lg:hidden">
        <Link href="/management" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384]">
            LL
          </span>
          <div>
            <span className="text-sm font-bold leading-tight text-white block">Lakowe Lakes</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#C5A56A] block">
              Management
            </span>
          </div>
        </Link>

        <button
          aria-expanded={open}
          aria-controls="management-drawer"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
        >
          <span>Menu</span>
          <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Mobile Drawer Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Management navigation"
          onClick={() => setOpen(false)}
        >
          <aside
            id="management-drawer"
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-xs flex-col justify-between overflow-y-auto border-l border-slate-700 bg-[#112032] p-5 text-white shadow-2xl sm:max-w-sm"
          >
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384]">
                    LL
                  </span>
                  <div>
                    <b className="text-sm font-bold text-white block">Management Portal</b>
                    <span className="text-[10px] font-semibold text-[#C5A56A]">Lakowe Lakes</span>
                  </div>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex size-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {navLinks()}
            </div>

            <div className="mt-8 border-t border-white/10 pt-4">
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 border border-white/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C5A56A] font-bold text-xs text-[#112032]">
                  {userInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{userName}</p>
                  <p className="text-[10px] font-medium text-emerald-400">
                    Supervisor · Active
                  </p>
                </div>
                <button
                  onClick={() => {
                    void fetch("/api/demo/session", { method: "DELETE" });
                    localStorage.removeItem("lakowe-staff-session");
                    router.push("/staff/login");
                  }}
                  className="text-xs font-semibold text-slate-300 underline hover:text-white"
                >
                  Exit
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-col min-w-0">
        {/* Desktop Top Navbar */}
        <header className="hidden lg:flex items-center justify-between border-b border-slate-200 bg-white/95 px-8 py-3.5 backdrop-blur-md shadow-2xs sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9A6510]">Management</span>
            <span className="text-slate-300 font-bold">/</span>
            <h1 className="text-sm font-bold text-[#172B42]">{currentTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
              <span>OPERA & Sage Live</span>
            </div>
            <Link
              href="/staff"
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#172B42] shadow-2xs transition hover:border-[#C5A56A] hover:bg-slate-100 hover:text-[#9A6510]"
            >
              <span>Staff Ops</span>
              <svg className="size-3 text-slate-400 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#9A6510]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </Link>
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

        <main className="min-w-0 p-4 sm:p-6 lg:p-8 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function ManagementLoginRequired() {
  return (
    <main className="ll-page grid min-h-screen place-items-center p-5">
      <section className="ll-panel w-full max-w-lg p-8 shadow-md">
        <p className="ll-eyebrow text-[#C5A56A]">Lakowe Lakes Management</p>
        <h1 className="ll-page-title mt-3 text-2xl font-bold text-[var(--ll-navy)]">
          Supervisor access required
        </h1>
        <p className="mt-4 text-sm font-medium text-slate-700">
          Choose the F&B supervisor identity in the staff demo to access this workspace.
        </p>
        <Link href="/staff/login" className="ll-btn ll-btn-primary mt-7">
          Open staff demo login
        </Link>
      </section>
    </main>
  );
}