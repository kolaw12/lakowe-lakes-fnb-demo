-- Phase 7C: safe handoff selection is distinct from the bearer credential.
CREATE TABLE "OrderFulfillment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "checkoutKey" TEXT NOT NULL,
    "handoffMode" TEXT NOT NULL,
    "destinationHint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderFulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderFulfillment_orderId_key" ON "OrderFulfillment"("orderId");
CREATE UNIQUE INDEX "OrderFulfillment_checkoutKey_key" ON "OrderFulfillment"("checkoutKey");
CREATE INDEX "OrderFulfillment_handoffMode_idx" ON "OrderFulfillment"("handoffMode");
