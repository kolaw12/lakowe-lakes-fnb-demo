import { NextRequest, NextResponse } from "next/server";
import { getDemoStaffUser } from "@/lib/demo-db";
import { MenuAvailabilityAuthorizationError, MenuAvailabilityValidationError, menuAvailabilitySnapshot, setMenuAvailability } from "@/lib/menu-availability";
export const dynamic = "force-dynamic";
const cookieName = "lakowe-demo-staff-id";
export async function GET(request: NextRequest) {
  const outletId = request.nextUrl.searchParams.get("outlet") || undefined;
  return NextResponse.json({ items: await menuAvailabilitySnapshot(outletId) });
}
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const actorId = request.cookies.get(cookieName)?.value || request.headers.get("x-demo-user-id") || (body && typeof body === "object" && "actorId" in body && typeof body.actorId === "string" ? body.actorId : undefined);
    if (!actorId) return NextResponse.json({ error: "A server-issued demo staff session is required." }, { status: 401 });
    const actor = await getDemoStaffUser(actorId);
    if (!body || typeof body !== "object" || !("outletId" in body) || typeof body.outletId !== "string" || !("itemId" in body) || typeof body.itemId !== "string" || !("available" in body) || typeof body.available !== "boolean") throw new MenuAvailabilityValidationError("Invalid menu availability request.");
    if ("actorId" in body && typeof body.actorId === "string" && body.actorId !== actor.id) return NextResponse.json({ error: "The request actor does not match the server-issued demo session." }, { status: 403 });
    return NextResponse.json({ item: await setMenuAvailability(actor.id, { outletId: body.outletId, itemId: body.itemId, available: body.available }) });
  } catch (error) {
    if (error instanceof MenuAvailabilityAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof MenuAvailabilityValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Availability could not be changed." }, { status: 400 });
  }
}
