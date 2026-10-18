import { NextRequest, NextResponse } from "next/server";
import { getDemoStaffUser } from "@/lib/demo-db";
import { completeOrderWithSupervisorException, OrderVerificationError } from "@/lib/order-verification";

export const dynamic = "force-dynamic";
const cookieName = "lakowe-demo-staff-id";

export async function POST(request: NextRequest) {
  try {
    const actorId = request.cookies.get(cookieName)?.value;
    if (!actorId) return NextResponse.json({ error: "A server-issued demo staff session is required.", code: "unauthorized" }, { status: 401 });
    const actor = await getDemoStaffUser(actorId);
    if (actor.role !== "supervisor") {
      return NextResponse.json({ error: "Only an authorized supervisor can record a handoff exception.", code: "forbidden" }, { status: 403 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid exception request.", code: "invalid_request" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const orderReference = typeof b.orderReference === "string" ? b.orderReference.trim() : "";
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!orderReference || !reason) {
      return NextResponse.json({ error: "Order reference and an exception reason are required.", code: "invalid_request" }, { status: 400 });
    }
    return NextResponse.json(await completeOrderWithSupervisorException({
      orderReference,
      actor,
      reason,
    }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OrderVerificationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Supervisor exception could not be recorded." }, { status: 500 });
  }
}
