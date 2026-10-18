"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffShell, useStaffSession } from "@/components/staff/StaffShell";
import { outlets } from "@/lib/fnb";
import { Dropdown } from "@/components/ui/Dropdown";

type Item = {
  itemId: string;
  outletId: string;
  name: string;
  available: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export default function MenuAvailabilityPage() {
  const user = useStaffSession();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [outlet, setOutlet] = useState("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/menu-availability", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Menu availability is unavailable.");
      setItems(j.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Menu availability is unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (outlet === "all" || i.outletId === outlet) &&
          (user?.role === "supervisor" || ["clubhouse", "winebar"].includes(i.outletId))
      ),
    [items, outlet, user]
  );

  async function toggle(item: Item) {
    setBusy(item.itemId);
    setError("");
    try {
      const r = await fetch("/api/menu-availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorId: user?.id,
          outletId: item.outletId,
          itemId: item.itemId,
          available: !item.available,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Availability could not be changed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Availability could not be changed.");
    } finally {
      setBusy("");
    }
  }

  const outletOptions = [
    { value: "all", label: "Assigned outlets" },
    ...outlets.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <StaffShell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ll-eyebrow text-[#9A6510]">Menu operations · demo</p>
          <h1 className="ll-page-title mt-2">Menu availability</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
            Changes apply to new checkout requests only; historical orders retain their recorded details.
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Dropdown
            aria-label="Outlet"
            value={outlet}
            onChange={setOutlet}
            options={outletOptions}
            className="min-w-[220px]"
          />
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-300/30 bg-red-50 p-4 text-sm font-bold text-[var(--ll-error)]"
        >
          {error}
        </p>
      )}

      <section className="ll-panel mt-7 overflow-hidden shadow-xs">
        <div className="divide-y divide-slate-100">
          {visible.map((item) => (
            <article
              key={`${item.outletId}-${item.itemId}`}
              className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-slate-50/50 transition"
            >
              <div>
                <p className="text-base font-bold text-[var(--ll-navy)]">{item.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-700">
                  {outlets.find((o) => o.id === item.outletId)?.name} ·{" "}
                  {item.updatedAt
                    ? `Changed ${new Date(item.updatedAt).toLocaleString()} by ${item.updatedBy}`
                    : "Available by default"}
                </p>
              </div>
              <button
                disabled={busy === item.itemId}
                onClick={() => void toggle(item)}
                className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all shadow-xs active:scale-95 ${
                  item.available
                    ? "bg-[#172B42] text-white hover:bg-[#0F2133]"
                    : "border-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                {busy === item.itemId ? "Saving…" : item.available ? "Available" : "Sold out"}
              </button>
            </article>
          ))}
          {!visible.length && (
            <p className="p-8 text-center text-sm font-semibold text-slate-600">
              No menu items are assigned to this outlet.
            </p>
          )}
        </div>
      </section>
    </StaffShell>
  );
}
