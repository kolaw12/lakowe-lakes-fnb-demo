-- Additive Phase 7B foundation. Historical orders are intentionally not backfilled.
CREATE TABLE "OrderVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "handoffMode" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "redeemedAt" DATETIME,
    "redeemedBy" TEXT,
    "revokedAt" DATETIME,
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderVerification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "OrderHandoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "handoffMode" TEXT NOT NULL,
    "safeMetadataJson" TEXT,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderHandoff_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderHandoff_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "OrderVerification" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderVerification_orderId_key" ON "OrderVerification"("orderId");
CREATE UNIQUE INDEX "OrderVerification_tokenHash_key" ON "OrderVerification"("tokenHash");
CREATE INDEX "OrderVerification_status_expiresAt_idx" ON "OrderVerification"("status", "expiresAt");
CREATE INDEX "OrderVerification_handoffMode_idx" ON "OrderVerification"("handoffMode");
CREATE UNIQUE INDEX "OrderHandoff_orderId_key" ON "OrderHandoff"("orderId");
CREATE UNIQUE INDEX "OrderHandoff_verificationId_key" ON "OrderHandoff"("verificationId");
CREATE INDEX "OrderHandoff_actorId_completedAt_idx" ON "OrderHandoff"("actorId", "completedAt");
CREATE INDEX "OrderHandoff_outletId_completedAt_idx" ON "OrderHandoff"("outletId", "completedAt");
