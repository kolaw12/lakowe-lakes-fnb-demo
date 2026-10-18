import { Prisma, type SageAccountingSync } from "@prisma/client";
import { managementEligibleAmount } from "@/lib/management-reporting";
import { prisma } from "@/lib/prisma";
import { getSageAdapter, SAGE_DEMO_MAPPING, SAGE_DEMO_SCENARIOS, type SagePreparedRecord, type SageScenario, type SageSourceRecord } from "@/lib/sage-demo-adapter";

type Actor = { id: string; role: string };
type SourceTransaction = {
  id: string; amount: number; status: string; adjustmentJson: string | null; paymentType: string; outletId: string;
  order: { reference: string }; outlet: { name: string };
};
type Amounts = { grossAmount: number; eligibleAmount: number; discountAmount: number; reversalAmount: number; reversalReference: string | null };
export type SageSyncResult = {
  duplicate: boolean;
  sync: {
    id: string; sourceTransactionId: string; sourceOrderReference: string; outletId: string; paymentMethod: string;
    sourceTransactionStatus: string; grossAmount: number; eligibleAmount: number; discountAmount: number; reversalAmount: number; reversalReference: string | null;
    mappingVersion: string; revenueCategory: string; offsetCategory: string; postingCategory: string; scenario: string;
    syncStatus: string; postingReference: string | null; reconciliationState: string; failureReason: string | null;
    attemptCount: number; createdAt: string; updatedAt: string; lastAttemptAt: string | null; lastCheckedAt: string | null;
  };
};

const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const encode = (value: unknown) => JSON.stringify(value);
function parse(value: string | null): Record<string, unknown> | null { if (!value) return null; try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null; } catch { return null; } }
function validScenario(value: string): value is SageScenario { return SAGE_DEMO_SCENARIOS.some(item => item.id === value); }
function amounts(transaction: Pick<SourceTransaction, "id" | "amount" | "status" | "adjustmentJson">): Amounts | null {
  if (!Number.isInteger(transaction.amount) || transaction.amount <= 0) return null;
  const eligible = managementEligibleAmount(transaction);
  if (eligible !== null) return { grossAmount: transaction.amount, eligibleAmount: eligible, discountAmount: transaction.amount - eligible, reversalAmount: 0, reversalReference: null };
  if (transaction.status !== "voided") return null;
  const adjustment = parse(transaction.adjustmentJson);
  if (adjustment?.type !== "void") return null;
  return { grossAmount: transaction.amount, eligibleAmount: 0, discountAmount: 0, reversalAmount: transaction.amount, reversalReference: typeof adjustment.reference === "string" ? adjustment.reference : transaction.id };
}
function sourceFor(syncId: string, transaction: SourceTransaction, values: Amounts): SageSourceRecord {
  if (!(transaction.outletId in SAGE_DEMO_MAPPING.outlets) || !(transaction.paymentType in SAGE_DEMO_MAPPING.payments)) throw new Error("No DEMO accounting mapping exists for this outlet or payment method.");
  return {
    syncId, transactionId: transaction.id, orderReference: transaction.order.reference,
    outletId: transaction.outletId as keyof typeof SAGE_DEMO_MAPPING.outlets,
    paymentMethod: transaction.paymentType as keyof typeof SAGE_DEMO_MAPPING.payments,
    sourceTransactionStatus: transaction.status, ...values,
  };
}
async function audit(tx: Prisma.TransactionClient, event: { actor: Actor; action: string; syncId: string; before?: unknown; after?: unknown }) {
  await tx.auditEvent.create({ data: { id: ref("AUD"), actorId: event.actor.id, actorRole: event.actor.role, action: event.action, entityType: "sageAccountingSync", entityId: event.syncId, requestId: event.syncId, beforeJson: event.before === undefined ? null : encode(event.before), afterJson: event.after === undefined ? null : encode(event.after) } });
}
function dto(row: SageAccountingSync, duplicate: boolean): SageSyncResult {
  return { duplicate, sync: {
    id: row.id, sourceTransactionId: row.sourceTransactionId, sourceOrderReference: row.sourceOrderReference,
    outletId: row.outletId, paymentMethod: row.paymentMethod, sourceTransactionStatus: row.sourceTransactionStatus,
    grossAmount: row.grossAmount, eligibleAmount: row.eligibleAmount, discountAmount: row.discountAmount,
    reversalAmount: row.reversalAmount, reversalReference: row.reversalReference, mappingVersion: row.mappingVersion, revenueCategory: row.revenueCategory,
    offsetCategory: row.offsetCategory, postingCategory: row.postingCategory, scenario: row.scenario,
    syncStatus: row.syncStatus, postingReference: row.postingReference, reconciliationState: row.reconciliationState,
    failureReason: row.failureReason, attemptCount: row.attemptCount, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(), lastAttemptAt: row.lastAttemptAt?.toISOString() || null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() || null,
  } };
}

export async function discoverSageCandidates() {
  const transactions = await prisma.transaction.findMany({
    where: { status: { in: ["settled", "discounted", "voided"] } },
    include: { order: { select: { reference: true } }, outlet: { select: { name: true } }, sageAccountingSync: { select: { id: true, syncStatus: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return transactions.flatMap(transaction => {
    const values = amounts(transaction);
    if (!values || !(transaction.outletId in SAGE_DEMO_MAPPING.outlets) || !(transaction.paymentType in SAGE_DEMO_MAPPING.payments)) return [];
    return [{
      transactionId: transaction.id, orderReference: transaction.order.reference, outletId: transaction.outletId, createdAt: transaction.createdAt.toISOString(),
      outletName: transaction.outlet.name, paymentMethod: transaction.paymentType, sourceStatus: transaction.status,
      ...values, synchronized: Boolean(transaction.sageAccountingSync), syncId: transaction.sageAccountingSync?.id || null,
      syncStatus: transaction.sageAccountingSync?.syncStatus || null,
    }];
  });
}

export async function prepareSageSync(transactionId: string, scenario: string, actor: Actor): Promise<SageSyncResult> {
  if (!transactionId || transactionId.length > 100 || !validScenario(scenario)) throw new Error("Select a valid source transaction and DEMO scenario.");
  const existing = await prisma.sageAccountingSync.findUnique({ where: { sourceTransactionId: transactionId } });
  if (existing) return dto(existing, true);
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { order: { select: { reference: true } }, outlet: { select: { name: true } } } });
  if (!transaction) throw new Error("That POS transaction was not found.");
  const values = amounts(transaction);
  if (!values) throw new Error("That POS transaction is not eligible for the documented DEMO accounting policy.");
  const syncId = ref("SAGESYNC");
  const prepared = await getSageAdapter().prepareAccountingRecord(sourceFor(syncId, transaction, values));
  try {
    const row = await prisma.$transaction(async tx => {
      const created = await tx.sageAccountingSync.create({ data: {
        id: syncId, sourceTransactionId: transaction.id, sourceOrderReference: transaction.order.reference,
        outletId: transaction.outletId, paymentMethod: transaction.paymentType, sourceTransactionStatus: transaction.status,
        ...values, mappingVersion: prepared.mappingVersion, revenueCategory: prepared.revenueCategory,
        offsetCategory: prepared.offsetCategory, postingCategory: prepared.postingCategory, payloadJson: encode(prepared),
        scenario, syncStatus: "queued", reconciliationState: "not_required", preparedBy: actor.id, preparedRole: actor.role,
      } });
      await audit(tx, { actor, action: "sage.sync.source_identified", syncId, after: { sourceTransactionId: transaction.id, orderReference: transaction.order.reference, sourceStatus: transaction.status, paymentMethod: transaction.paymentType, ...values } });
      await audit(tx, { actor, action: "sage.sync.prepared", syncId, after: { mappingVersion: prepared.mappingVersion, postingCategory: prepared.postingCategory, revenueCategory: prepared.revenueCategory, offsetCategory: prepared.offsetCategory, lines: prepared.lines } });
      return created;
    });
    return dto(row, false);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return dto(await prisma.sageAccountingSync.findUniqueOrThrow({ where: { sourceTransactionId: transactionId } }), true);
    throw error;
  }
}

export async function submitSageSync(syncId: string, actor: Actor): Promise<SageSyncResult> {
  let row = await prisma.sageAccountingSync.findUnique({ where: { id: syncId } });
  if (!row) throw new Error("That simulated accounting record was not found.");
  if (row.syncStatus === "posted") return dto(row, true);
  if (!["queued", "transmission_failed"].includes(row.syncStatus)) throw new Error("This accounting record cannot be safely submitted in its current state.");
  const attemptNumber = row.attemptCount + 1;
  row = await prisma.$transaction(async tx => {
    const updated = await tx.sageAccountingSync.update({ where: { id: row!.id }, data: { syncStatus: "posting", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastActionBy: actor.id, failureReason: null } });
    await audit(tx, { actor, action: "sage.sync.posting_attempt", syncId: row!.id, before: { syncStatus: row!.syncStatus }, after: { syncStatus: "posting", attemptNumber } });
    return updated;
  });
  let result;
  try {
    result = await getSageAdapter().submitAccountingRecord(JSON.parse(row.payloadJson) as SagePreparedRecord, row.scenario as SageScenario, attemptNumber, row.id);
  } catch {
    result = { status: "uncertain" as const, postingReference: null, reason: "The simulated accounting submission ended without a confirmed acknowledgment. Manual reconciliation is required." };
  }
  const state = result.status === "posted" ? "not_required" : result.status === "unavailable" ? "safe_retry" : result.status === "uncertain" && result.postingReference ? "pending" : result.status === "uncertain" ? "manual_review" : "not_required";
  const syncStatus = result.status === "unavailable" ? "transmission_failed" : result.status;
  row = await prisma.$transaction(async tx => {
    const updated = await tx.sageAccountingSync.update({ where: { id: row!.id }, data: { syncStatus, postingReference: result.postingReference, reconciliationState: state, failureReason: result.reason, lastCheckedAt: new Date(), lastActionBy: actor.id } });
    await audit(tx, { actor, action: "sage.sync.posting_result", syncId: row!.id, before: { syncStatus: "posting" }, after: { syncStatus, postingReference: result.postingReference, reconciliationState: state, reason: result.reason } });
    return updated;
  });
  return dto(row, false);
}

export async function reconcileSageSync(syncId: string, actor: Actor): Promise<SageSyncResult> {
  let row = await prisma.sageAccountingSync.findUnique({ where: { id: syncId } });
  if (!row) throw new Error("That simulated accounting record was not found.");
  if (row.syncStatus === "posted") return dto(row, true);
  if (row.syncStatus !== "uncertain" || row.reconciliationState !== "pending" || !row.postingReference) throw new Error("This accounting record is not eligible for deterministic reconciliation.");
  await prisma.$transaction(async tx => {
    await audit(tx, { actor, action: "sage.sync.reconciliation_requested", syncId: row!.id, after: { postingReference: row!.postingReference } });
    await tx.sageAccountingSync.update({ where: { id: row!.id }, data: { lastCheckedAt: new Date(), lastActionBy: actor.id } });
  });
  const result = await getSageAdapter().retrievePostingStatus(row.postingReference);
  const status = result.status === "posted" ? "posted" : result.status;
  const state = status === "posted" ? "resolved" : status === "uncertain" ? "pending" : "manual_review";
  row = await prisma.$transaction(async tx => {
    const updated = await tx.sageAccountingSync.update({ where: { id: row!.id }, data: { syncStatus: status, postingReference: result.postingReference, reconciliationState: state, failureReason: result.reason, lastCheckedAt: new Date(), lastActionBy: actor.id } });
    await audit(tx, { actor, action: "sage.sync.reconciled", syncId: row!.id, before: { syncStatus: row!.syncStatus }, after: { syncStatus: status, postingReference: result.postingReference, reconciliationState: state, reason: result.reason } });
    return updated;
  });
  return dto(row, false);
}
