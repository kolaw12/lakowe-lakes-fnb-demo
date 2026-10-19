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
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ outletId: "", name: "", category: "", description: "", price: "", prepTime: "", imageUrl: "" });
  const [adding, setAdding] = useState(false);

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

  const assignedOutlets = useMemo(() => outlets.filter((entry) => user?.role === "supervisor" || user?.outlets.includes(entry.id as "clubhouse" | "winebar")), [user]);
  const outletOptions = [
    { value: "all", label: "Assigned outlets" },
    ...assignedOutlets.map((o) => ({ value: o.id, label: o.name })),
  ];

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    const price = Math.round(Number(newItem.price) * 100);
    if (!newItem.outletId || !newItem.name.trim() || !newItem.category.trim() || !newItem.description.trim() || !Number.isInteger(price) || price < 100) {
      setError("Add the outlet, name, category, description and a valid price.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const response = await fetch("/api/menu-availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "addItem", actorId: user?.id, ...newItem, price }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "The dish could not be added.");
      setNewItem({ outletId: "", name: "", category: "", description: "", price: "", prepTime: "", imageUrl: "" });
      setAddOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The dish could not be added.");
    } finally {
      setAdding(false);
    }
  }

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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Dropdown
            aria-label="Outlet"
            value={outlet}
            onChange={setOutlet}
            options={outletOptions}
            className="min-w-[220px]"
          />
          <button type="button" onClick={() => setAddOpen((open) => !open)} className="ll-btn ll-btn-primary min-h-11 whitespace-nowrap px-4 text-xs">
            {addOpen ? "Close" : "Add dish"}
          </button>
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

      {addOpen && (
        <form onSubmit={addItem} className="ll-panel mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="ll-eyebrow text-[#9A6510]">New menu item</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--ll-navy)]">Add a dish to an assigned outlet</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">Saved to operations menu</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="ll-label text-xs">Outlet
              <select required value={newItem.outletId} onChange={(event) => setNewItem(current => ({ ...current, outletId: event.target.value }))} className="ll-input mt-1.5">
                <option value="">Select your outlet</option>
                {assignedOutlets.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            <label className="ll-label text-xs">Dish name
              <input required maxLength={80} value={newItem.name} onChange={(event) => setNewItem(current => ({ ...current, name: event.target.value }))} className="ll-input mt-1.5" placeholder="e.g. Grilled sea bass" />
            </label>
            <label className="ll-label text-xs">Category
              <input required maxLength={40} value={newItem.category} onChange={(event) => setNewItem(current => ({ ...current, category: event.target.value }))} className="ll-input mt-1.5" placeholder="Mains, drinks, dessert…" />
            </label>
            <label className="ll-label text-xs">Price (₦)
              <input required min="1" step="0.01" inputMode="decimal" value={newItem.price} onChange={(event) => setNewItem(current => ({ ...current, price: event.target.value }))} className="ll-input mt-1.5" placeholder="16500" />
            </label>
            <label className="ll-label text-xs sm:col-span-2">Description
              <textarea required maxLength={240} value={newItem.description} onChange={(event) => setNewItem(current => ({ ...current, description: event.target.value }))} className="ll-input mt-1.5 min-h-24" placeholder="A short guest-facing description of the dish." />
            </label>
            <label className="ll-label text-xs">Preparation time <span className="font-normal text-[var(--ll-muted)]">(optional)</span>
              <input maxLength={40} value={newItem.prepTime} onChange={(event) => setNewItem(current => ({ ...current, prepTime: event.target.value }))} className="ll-input mt-1.5" placeholder="15–20 mins" />
            </label>
            <label className="ll-label text-xs">Image URL <span className="font-normal text-[var(--ll-muted)]">(optional)</span>
              <input type="url" value={newItem.imageUrl} onChange={(event) => setNewItem(current => ({ ...current, imageUrl: event.target.value }))} className="ll-input mt-1.5" placeholder="https://…" />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={adding} className="ll-btn ll-btn-primary min-h-11 px-5 text-xs">{adding ? "Adding dish…" : "Add dish"}</button>
            <button type="button" onClick={() => setAddOpen(false)} className="ll-btn ll-btn-secondary min-h-11 px-5 text-xs">Cancel</button>
          </div>
        </form>
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
