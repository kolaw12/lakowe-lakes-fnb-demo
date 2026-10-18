-- CreateTable
CREATE TABLE "DemoUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "outletIds" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "choicesJson" TEXT NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "adjustmentJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OverrideRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedAmount" INTEGER,
    "status" TEXT NOT NULL,
    "decisionActorId" TEXT,
    "decisionReason" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OverrideRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "sourceLedgerId" TEXT NOT NULL,
    "refundLedgerEntryId" TEXT,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decisionActorId" TEXT,
    "decisionReason" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuAvailability" (
    "outletId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("outletId", "itemId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "description" TEXT,
    "orderReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepositRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperaRoomChargeAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "orderReference" TEXT NOT NULL,
    "orderId" TEXT,
    "transactionId" TEXT,
    "outletId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "roomReference" TEXT NOT NULL,
    "guestNameMasked" TEXT NOT NULL,
    "checkoutJson" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "postingStatus" TEXT NOT NULL,
    "postingReference" TEXT,
    "reconciliationState" TEXT NOT NULL,
    "failureReason" TEXT,
    "scenario" TEXT,
    "initiatedBy" TEXT NOT NULL,
    "initiatorRole" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperaRoomChargeAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperaRoomChargeAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SageAccountingSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceTransactionId" TEXT NOT NULL,
    "sourceOrderReference" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "sourceTransactionStatus" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "eligibleAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "reversalAmount" INTEGER NOT NULL,
    "reversalReference" TEXT,
    "mappingVersion" TEXT NOT NULL,
    "revenueCategory" TEXT NOT NULL,
    "offsetCategory" TEXT NOT NULL,
    "postingCategory" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "postingReference" TEXT,
    "reconciliationState" TEXT NOT NULL,
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "preparedBy" TEXT NOT NULL,
    "preparedRole" TEXT NOT NULL,
    "lastActionBy" TEXT,
    "lastAttemptAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SageAccountingSync_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_orderId_key" ON "Transaction"("orderId");

-- CreateIndex
CREATE INDEX "OverrideRequest_status_idx" ON "OverrideRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_transactionId_key" ON "RefundRequest"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_sourceLedgerId_key" ON "RefundRequest"("sourceLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_refundLedgerEntryId_key" ON "RefundRequest"("refundLedgerEntryId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_walletId_idx" ON "RefundRequest"("walletId");

-- CreateIndex
CREATE INDEX "MenuAvailability_outletId_available_idx" ON "MenuAvailability"("outletId", "available");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_reference_key" ON "WalletLedgerEntry"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRecord_reference_key" ON "DepositRecord"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OperaRoomChargeAttempt_idempotencyKey_key" ON "OperaRoomChargeAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperaRoomChargeAttempt_orderReference_key" ON "OperaRoomChargeAttempt"("orderReference");

-- CreateIndex
CREATE UNIQUE INDEX "OperaRoomChargeAttempt_orderId_key" ON "OperaRoomChargeAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OperaRoomChargeAttempt_transactionId_key" ON "OperaRoomChargeAttempt"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "OperaRoomChargeAttempt_postingReference_key" ON "OperaRoomChargeAttempt"("postingReference");

-- CreateIndex
CREATE INDEX "OperaRoomChargeAttempt_postingStatus_idx" ON "OperaRoomChargeAttempt"("postingStatus");

-- CreateIndex
CREATE INDEX "OperaRoomChargeAttempt_reconciliationState_idx" ON "OperaRoomChargeAttempt"("reconciliationState");

-- CreateIndex
CREATE INDEX "OperaRoomChargeAttempt_createdAt_idx" ON "OperaRoomChargeAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SageAccountingSync_sourceTransactionId_key" ON "SageAccountingSync"("sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SageAccountingSync_postingReference_key" ON "SageAccountingSync"("postingReference");

-- CreateIndex
CREATE INDEX "SageAccountingSync_syncStatus_idx" ON "SageAccountingSync"("syncStatus");

-- CreateIndex
CREATE INDEX "SageAccountingSync_reconciliationState_idx" ON "SageAccountingSync"("reconciliationState");

-- CreateIndex
CREATE INDEX "SageAccountingSync_createdAt_idx" ON "SageAccountingSync"("createdAt");

