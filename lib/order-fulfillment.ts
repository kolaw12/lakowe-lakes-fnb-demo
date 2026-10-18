import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { HANDOFF_MODES, type HandoffMode } from "@/lib/fnb";
export { HANDOFF_MODES, type HandoffMode };
export type FulfillmentInput = { handoffMode?: unknown; destination?: unknown; checkoutKey: string; outletId: string };
export type FulfillmentSelection = { handoffMode: HandoffMode; destinationHint: string | null; checkoutKey: string };
const eligible: Record<HandoffMode,string[]> = { counter:["clubhouse","winebar","revivo","restaurant-18"], table:["clubhouse","restaurant-18"], room:["clubhouse","restaurant-18"], golf_course:["clubhouse","winebar"] };
const hash=(raw:string)=>createHash("sha256").update(raw).digest("hex");
export function credentialSecrets() { return { token:"LLQ1."+randomBytes(32).toString("base64url"), collectionCode:"LLC1-"+randomBytes(10).toString("hex").toUpperCase() }; }
export function normalizeFulfillment(input: FulfillmentInput): FulfillmentSelection {
 const mode = input.handoffMode === undefined ? "counter" : input.handoffMode;
 if (!HANDOFF_MODES.includes(mode as HandoffMode) || !eligible[mode as HandoffMode].includes(input.outletId)) throw Error("Select a valid handoff option for this outlet.");
 if (!input.checkoutKey || input.checkoutKey.length > 120) throw Error("A valid checkout key is required.");
 const raw = typeof input.destination === "string" ? input.destination.trim() : "";
 if (mode === "counter" && raw) throw Error("Counter pickup does not require a destination.");
 if (mode !== "counter" && (!raw || raw.length > 80)) throw Error("Provide a valid handoff destination.");
 const hint = mode === "room" ? "Room "+raw.replace(/.(?=..)/g,"•") : raw || null;
 return { handoffMode: mode as HandoffMode, destinationHint: hint, checkoutKey: input.checkoutKey };
}
export async function createVerificationForConfirmedOrder(tx: Prisma.TransactionClient, input: { orderId:string; fulfillment:FulfillmentSelection }) {
 const secrets = credentialSecrets();
 const verification = await tx.orderVerification.create({data:{orderId:input.orderId,tokenHash:hash(secrets.token),collectionCodeHash:hash(secrets.collectionCode),tokenVersion:1,status:"active",handoffMode:input.fulfillment.handoffMode,expiresAt:new Date(Date.now()+86400000)}});
 await tx.orderFulfillment.create({data:{orderId:input.orderId,checkoutKey:input.fulfillment.checkoutKey,handoffMode:input.fulfillment.handoffMode,destinationHint:input.fulfillment.destinationHint}});
 return { token: secrets.token, collectionCode: secrets.collectionCode, verification: { id:verification.id, handoffMode:verification.handoffMode, expiresAt:verification.expiresAt.toISOString(), destinationHint:input.fulfillment.destinationHint } };
}