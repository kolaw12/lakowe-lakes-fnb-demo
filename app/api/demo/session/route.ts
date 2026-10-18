import { NextRequest, NextResponse } from "next/server";
import { getDemoStaffUser } from "@/lib/demo-db";

export const dynamic = "force-dynamic";
const DEMO_STAFF_COOKIE = "lakowe-demo-staff-id";

export async function GET(request: NextRequest) {
  const actorId = request.cookies.get(DEMO_STAFF_COOKIE)?.value;
  if (!actorId) return NextResponse.json({ session: null });
  try {
    const user = await getDemoStaffUser(actorId);
    return NextResponse.json({ session: { id: user.id, name: user.name, role: user.role } });
  } catch {
    return NextResponse.json({ session: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("actorId" in body) || typeof body.actorId !== "string") throw new Error("Select a valid demo staff identity.");
    const user = await getDemoStaffUser(body.actorId);
    const response = NextResponse.json({ session: { id: user.id, name: user.name, role: user.role }, limitation: "Demo identity selection is not production authentication." });
    response.cookies.set({ name: DEMO_STAFF_COOKIE, value: user.id, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo session could not be created." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: DEMO_STAFF_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
