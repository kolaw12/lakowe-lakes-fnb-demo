"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFnb } from "@/components/fnb/FnbProvider";
import { OrderStatusIndicator } from "@/components/ui/DesignSystem";

export function Mark() {
  return (
    <Link href="/dining" className="flex items-center gap-2.5 transition hover:opacity-90" aria-label="Lakowe Lakes Dining home">
      <span className="flex size-9 items-center justify-center rounded-xl border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-xs font-bold text-[#E5C384] shadow-xs">
        LL
      </span>
      <div>
        <span className="block text-sm font-bold leading-tight text-[#172B42]">Lakowe Lakes</span>
        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C5A56A]">Dining & Lounge</span>
      </div>
    </Link>
  );
}

export function CartBadge() {
  const { cart } = useFnb();
  const count = cart.reduce((n, x) => n + x.quantity, 0);
  return (
    <Link
      href="/dining/cart"
      className="relative inline-flex min-h-[42px] items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-[#172B42] shadow-xs transition hover:border-[#C5A56A] hover:bg-slate-50"
      aria-label={`Basket, ${count} items`}
    >
      <svg className="size-4 text-[#C5A56A]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      <span>Basket</span>
      {count > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-[#172B42] text-[10px] font-bold text-white shadow-xs">
          {count}
        </span>
      )}
    </Link>
  );
}

export function FnbShell({
  children,
  backHref,
  title,
  bare = false,
}: {
  children: React.ReactNode;
  backHref?: string;
  title?: string;
  bare?: boolean;
}) {
  return (
    <main className="fnb-app ll-page pb-24">
      {!bare && (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md shadow-xs">
          <div className="ll-container flex items-center justify-between">
            {backHref ? (
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Link
                  href={backHref}
                  className="group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-[#172B42] shadow-2xs transition-all hover:border-[#C5A56A] hover:bg-slate-50 hover:text-[#9A6510] active:scale-95"
                  aria-label={`Back to ${title || "previous page"}`}
                >
                  <svg className="size-3.5 text-slate-500 transition-transform duration-200 group-hover:-translate-x-1 group-hover:text-[#9A6510]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  <span>{title || "Back"}</span>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg border border-[#C5A56A]/50 bg-gradient-to-br from-[#1E3858] to-[#122336] font-serif text-[11px] font-bold text-[#E5C384]">
                    LL
                  </span>
                  <span className="hidden font-serif text-sm font-bold text-[#172B42] min-[400px]:inline">
                    Lakowe Lakes
                  </span>
                </div>
              </div>
            ) : (
              <Mark />
            )}
            <CartBadge />
          </div>
        </header>
      )}
      {children}
    </main>
  );
}

export function DiningNav() {
  const p = usePathname();
  const tabs = [
    {
      href: "/dining",
      label: "Dining",
      icon: (
        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: "/dining/orders",
      label: "Orders",
      icon: (
        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: "/wallet",
      label: "Wallet",
      icon: (
        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ] as const;

  return (
    <nav aria-label="Guest navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md shadow-lg">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((tab) => {
          const active = tab.href === "/wallet" ? p.startsWith("/wallet") : p === tab.href;
          return (
            <Link
              href={tab.href}
              key={tab.href}
              className={`flex min-h-12 min-w-16 flex-col items-center justify-center rounded-full px-4 text-xs font-bold transition-all ${
                active
                  ? "bg-[#172B42] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden="true" className={active ? "text-[#C5A56A]" : "text-slate-500"}>
                {tab.icon}
              </span>
              <span className="mt-1 font-semibold">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <OrderStatusIndicator status={status as "received" | "preparing" | "ready" | "completed"} />;
}
