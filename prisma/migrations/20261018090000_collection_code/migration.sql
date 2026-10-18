ALTER TABLE "OrderVerification" ADD COLUMN "collectionCodeHash" TEXT;
ALTER TABLE "OrderHandoff" ADD COLUMN "exceptionReason" TEXT;
UPDATE "OrderVerification" SET "collectionCodeHash" = "tokenHash" WHERE "collectionCodeHash" IS NULL;
CREATE UNIQUE INDEX "OrderVerification_collectionCodeHash_key" ON "OrderVerification"("collectionCodeHash");
CREATE TABLE "OrderVerificationAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderVerificationAttempt_actorId_createdAt_idx" ON "OrderVerificationAttempt"("actorId", "createdAt");
CREATE INDEX "OrderVerificationAttempt_credentialHash_createdAt_idx" ON "OrderVerificationAttempt"("credentialHash", "createdAt");
