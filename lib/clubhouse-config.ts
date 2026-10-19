/** Clubhouse-only deployment switch. Change this one value to restore multi-outlet mode later. */
export const CLUBHOUSE_ONLY = true;
export const ACTIVE_OUTLET_ID = "clubhouse";
export const ACTIVE_OUTLET_NAME = "The Clubhouse";
export function isActiveOrderingOutlet(outletId: string) { return !CLUBHOUSE_ONLY || outletId === ACTIVE_OUTLET_ID; }
export function assertActiveOrderingOutlet(outletId: string) {
  if (!isActiveOrderingOutlet(outletId)) throw new Error("New orders are currently available at The Clubhouse only.");
}
