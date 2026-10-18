import { NextRequest, NextResponse } from "next/server";
import { checkoutWithOpera, getGuestOperaAttempt } from "@/lib/opera-room-charge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body)) throw new Error("Invalid simulated room-charge request.");
    if (body.action === "status") {
      if (!("idempotencyKey" in body) || typeof body.idempotencyKey !== "string") throw new Error("A valid demo checkout key is required.");
      return NextResponse.json(await getGuestOperaAttempt(body.idempotencyKey));
    }
    if (body.action !== "checkout" || !("outletId" in body) || !("customerName" in body) || !("items" in body) || !("roomReference" in body) || !("guestSurname" in body) || !("verificationCode" in body) || !("idempotencyKey" in body)) throw new Error("Invalid simulated room-charge request.");
    const result = await checkoutWithOpera({
      outletId: String(body.outletId), customerName: String(body.customerName), items: body.items,
      roomReference: String(body.roomReference), guestSurname: String(body.guestSurname),
      verificationCode: String(body.verificationCode), idempotencyKey: String(body.idempotencyKey),
      handoffMode: "handoffMode" in body ? body.handoffMode : undefined,
      destination: "destination" in body ? body.destination : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulated room charge failed." }, { status: 400 });
  }
}
