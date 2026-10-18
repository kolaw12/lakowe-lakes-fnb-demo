import { NextRequest, NextResponse } from "next/server";
import { getDemoStaffUser } from "@/lib/demo-db";
import { confirmOrderVerification, OrderVerificationError } from "@/lib/order-verification";

export const dynamic = "force-dynamic";
const cookieName = "lakowe-demo-staff-id";

export async function POST(request: NextRequest) {
  try {
    const actorId = request.cookies.get(cookieName)?.value;
    if (!actorId) return NextResponse.json({ error: "A server-issued demo staff session is required." }, { status: 401 });
    const actor = await getDemoStaffUser(actorId);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Provide a valid order verification code." }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const rawCredential = b.token || b.collectionCode || b.code || b.credential;
    if (typeof rawCredential !== "string" || !rawCredential.trim() || rawCredential.length > 100) {
      return NextResponse.json({ error: "Provide a valid order verification code." }, { status: 400 });
    }
    return NextResponse.json(await confirmOrderVerification(actor, rawCredential.trim()), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OrderVerificationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Order verification confirmation is unavailable." }, { status: 500 });
  }
}
