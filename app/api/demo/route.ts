import { NextRequest, NextResponse } from "next/server";
import { createOrder, decideOverride, getDemoStaffUser, OrderStatusAuthorizationError, OrderStatusTransitionError, requestOverride, snapshot, updateOrder } from "@/lib/demo-db";
import { decideWalletRefund, RefundAuthorizationError, RefundConflictError, RefundValidationError, requestWalletRefund } from "@/lib/wallet-refunds";

export const dynamic = "force-dynamic";
const DEMO_STAFF_COOKIE = "lakowe-demo-staff-id";

export async function GET() {
  return NextResponse.json(await snapshot());
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") throw new Error("Unsupported demo action.");
    if (body.action === "createOrder") {
      const data = await createOrder(body as unknown as { outletId: string; customerName: string; items: never[] });
      return NextResponse.json({ data, snapshot: await snapshot() });
    }

    const sessionId = request.cookies.get(DEMO_STAFF_COOKIE)?.value;
    if (!sessionId) return NextResponse.json({ error: "A server-issued demo staff session is required." }, { status: 401 });
    const actor = await getDemoStaffUser(sessionId);
    if ("actorId" in body && typeof body.actorId === "string" && body.actorId !== actor.id) {
      return NextResponse.json({ error: "The request actor does not match the server-issued demo session." }, { status: 403 });
    }

    let data;
    if (body.action === "updateOrder") {
      if (!("reference" in body) || typeof body.reference !== "string" || !("status" in body) || typeof body.status !== "string") throw new Error("Invalid order status request.");
      const exceptionReason = typeof (body as Record<string, unknown>).exceptionReason === "string" ? ((body as Record<string, unknown>).exceptionReason as string) : undefined;
      data = await updateOrder(actor.id, body.reference, body.status as never, exceptionReason);
    } else if (body.action === "requestOverride") {
      if (!("transactionId" in body) || typeof body.transactionId !== "string" || !("requestedAction" in body) || (body.requestedAction !== "void" && body.requestedAction !== "discount") || !("reason" in body) || typeof body.reason !== "string") throw new Error("Invalid override request.");
      data = await requestOverride(actor.id, { transactionId: body.transactionId, action: body.requestedAction, reason: body.reason, proposedAmount: "proposedAmount" in body && typeof body.proposedAmount === "number" ? body.proposedAmount : undefined });
    } else if (body.action === "requestWalletRefund") {
      if (!("transactionId" in body) || typeof body.transactionId !== "string" || !("reason" in body) || typeof body.reason !== "string") throw new Error("Invalid refund request.");
      data = await requestWalletRefund(actor.id, body.transactionId, body.reason);
    } else if (body.action === "decideWalletRefund") {
      if (!("requestId" in body) || typeof body.requestId !== "string" || !("decision" in body) || (body.decision !== "approved" && body.decision !== "rejected") || !("reason" in body) || typeof body.reason !== "string") throw new Error("Invalid refund decision.");
      data = await decideWalletRefund(actor.id, body.requestId, body.decision, body.reason);
    } else if (body.action === "decideOverride") {
      if (!("requestId" in body) || typeof body.requestId !== "string" || !("decision" in body) || (body.decision !== "approved" && body.decision !== "rejected") || !("reason" in body) || typeof body.reason !== "string") throw new Error("Invalid approval decision.");
      data = await decideOverride(actor.id, body.requestId, body.decision, body.reason);
    } else throw new Error("Unsupported demo action.");

    return NextResponse.json({ data, snapshot: await snapshot() });
  } catch (error) {
    if (error instanceof OrderStatusAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RefundAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RefundConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof RefundValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof OrderStatusTransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo operation failed." }, { status: 400 });
  }
}
