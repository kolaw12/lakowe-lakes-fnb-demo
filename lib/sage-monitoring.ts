import type { Prisma, PrismaClient } from "@prisma/client";
import { discoverSageCandidates } from "@/lib/sage-accounting";
import { SAGE_DEMO_MAPPING, SAGE_DEMO_SCENARIOS } from "@/lib/sage-demo-adapter";
import { prisma } from "@/lib/prisma";

type SageDb = Pick<PrismaClient, "sageAccountingSync" | "auditEvent" | "demoUser" | "outlet">;
type Input = { from?: string | null; to?: string | null; outlet?: string | null; syncStatus?: string | null; paymentMethod?: string | null; reference?: string | null; page?: string | null; pageSize?: string | null };
type Option = { id: string; label: string };
export class SageMonitoringInputError extends Error {}
export type SageMonitoringReport = {
  generatedAt: string;
  filters: { from: string | null; to: string | null; outlet: string | null; syncStatus: string | null; paymentMethod: string | null; reference: string | null };
  options: { outlets: Option[]; syncStatuses: Option[]; paymentMethods: Option[]; scenarios: Option[] };
  mapping: { version: string; disclaimer: string };
  summary: { total: number; queued: number; posted: number; rejected: number; transmissionFailed: number; uncertain: number; eligibleUnsynchronized: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  candidates: Awaited<ReturnType<typeof discoverSageCandidates>>;
  records: Array<{
    id: string; sourceTransactionId: string; sourceOrderReference: string; outletId: string; outletName: string;
    paymentMethod: string; sourceTransactionStatus: string; grossAmount: number; eligibleAmount: number;
    discountAmount: number; reversalAmount: number; reversalReference: string | null; revenueCategory: string; offsetCategory: string; postingCategory: string;
    syncStatus: string; postingReference: string | null; reconciliationState: string; failureReason: string | null;
    scenario: string; attemptCount: number; attemptTimestamp: string; lastAttemptAt: string | null; lastCheckedAt: string | null;
    canSubmit: boolean; canRetry: boolean; canReconcile: boolean;
    audits: Array<{ id: string; action: string; actorId: string; actorName: string; actorRole: string; timestamp: string; before: unknown; after: unknown }>;
  }>;
  limitations: string[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function text(value?: string | null) { return value?.trim() || null; }
function validDate(value: string) { return datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function parse(value: string | null): unknown { if (!value) return null; try { return JSON.parse(value) as unknown; } catch { return { unavailable: "Stored JSON could not be parsed." }; } }
function pageValue(raw: string | null | undefined, fallback: number, maximum: number, label: string) {
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new SageMonitoringInputError(`${label} must be a positive integer.`);
  const parsed = Number(raw);
  if (parsed < 1 || parsed > maximum) throw new SageMonitoringInputError(`${label} must be between 1 and ${maximum}.`);
  return parsed;
}
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function validate(selected: string | null, options: Option[], message: string) {
  if (selected && !options.some(option => option.id === selected)) throw new SageMonitoringInputError(message);
}

export async function getSageMonitoringReport(input: Input = {}, db: SageDb = prisma): Promise<SageMonitoringReport> {
  const filters = { from: text(input.from), to: text(input.to), outlet: text(input.outlet), syncStatus: text(input.syncStatus), paymentMethod: text(input.paymentMethod), reference: text(input.reference) };
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) throw new SageMonitoringInputError("Dates must use a valid YYYY-MM-DD calendar date.");
  if (filters.from && filters.to && filters.from > filters.to) throw new SageMonitoringInputError("End date cannot be before start date.");
  if (filters.reference && filters.reference.length > 100) throw new SageMonitoringInputError("Reference search cannot exceed 100 characters.");
  const page = pageValue(input.page, 1, 100000, "Page"), pageSize = pageValue(input.pageSize, 10, 100, "Page size");
  const [outlets, statusRows] = await Promise.all([
    db.outlet.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.sageAccountingSync.findMany({ distinct: ["syncStatus"], select: { syncStatus: true } }),
  ]);
  const options = {
    outlets: outlets.map(outlet => ({ id: outlet.id, label: outlet.name })),
    syncStatuses: statusRows.map(row => ({ id: row.syncStatus, label: label(row.syncStatus) })).sort((a, b) => a.label.localeCompare(b.label)),
    paymentMethods: Object.entries(SAGE_DEMO_MAPPING.payments).map(([id, item]) => ({ id, label: item.classification })).sort((a, b) => a.label.localeCompare(b.label)),
    scenarios: SAGE_DEMO_SCENARIOS.map(item => ({ id: item.id, label: item.label })),
  };
  validate(filters.outlet, options.outlets, "Select a valid outlet.");
  validate(filters.syncStatus, options.syncStatuses, "Select a valid synchronization status.");
  validate(filters.paymentMethod, options.paymentMethods, "Select a valid payment method.");
  const and: Prisma.SageAccountingSyncWhereInput[] = [];
  if (filters.from || filters.to) and.push({ createdAt: { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) } });
  if (filters.outlet) and.push({ outletId: filters.outlet });
  if (filters.syncStatus) and.push({ syncStatus: filters.syncStatus });
  if (filters.paymentMethod) and.push({ paymentMethod: filters.paymentMethod });
  if (filters.reference) and.push({ OR: [{ id: { contains: filters.reference } }, { sourceTransactionId: { contains: filters.reference } }, { sourceOrderReference: { contains: filters.reference } }, { postingReference: { contains: filters.reference } }] });
  const where: Prisma.SageAccountingSyncWhereInput = and.length ? { AND: and } : {};
  const [totalItems, rows, grouped, allCandidates] = await Promise.all([
    db.sageAccountingSync.count({ where }),
    db.sageAccountingSync.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.sageAccountingSync.groupBy({ by: ["syncStatus"], where, _count: true }),
    discoverSageCandidates(),
  ]);
  const candidates = allCandidates.filter(candidate => !candidate.synchronized)
    .filter(candidate => !filters.outlet || candidate.outletId === filters.outlet)
    .filter(candidate => !filters.paymentMethod || candidate.paymentMethod === filters.paymentMethod)
    .filter(candidate => !filters.from || candidate.createdAt.slice(0, 10) >= filters.from)
    .filter(candidate => !filters.to || candidate.createdAt.slice(0, 10) <= filters.to);
  const ids = rows.map(row => row.id);
  const [audits, users] = await Promise.all([
    ids.length ? db.auditEvent.findMany({ where: { entityType: "sageAccountingSync", entityId: { in: ids } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [],
    db.demoUser.findMany({ select: { id: true, name: true } }),
  ]);
  const userMap = new Map(users.map(user => [user.id, user.name])), outletMap = new Map(outlets.map(outlet => [outlet.id, outlet.name]));
  const count = (status: string) => grouped.find(row => row.syncStatus === status)?._count || 0;
  return {
    generatedAt: new Date().toISOString(), filters, options,
    mapping: { version: SAGE_DEMO_MAPPING.version, disclaimer: SAGE_DEMO_MAPPING.disclaimer },
    summary: { total: totalItems, queued: count("queued"), posted: count("posted"), rejected: count("rejected"), transmissionFailed: count("transmission_failed"), uncertain: count("uncertain"), eligibleUnsynchronized: candidates.length },
    pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
    candidates,
    records: rows.map(row => ({
      id: row.id, sourceTransactionId: row.sourceTransactionId, sourceOrderReference: row.sourceOrderReference,
      outletId: row.outletId, outletName: outletMap.get(row.outletId) || row.outletId, paymentMethod: row.paymentMethod,
      sourceTransactionStatus: row.sourceTransactionStatus, grossAmount: row.grossAmount, eligibleAmount: row.eligibleAmount,
      discountAmount: row.discountAmount, reversalAmount: row.reversalAmount, reversalReference: row.reversalReference, revenueCategory: row.revenueCategory,
      offsetCategory: row.offsetCategory, postingCategory: row.postingCategory, syncStatus: row.syncStatus,
      postingReference: row.postingReference, reconciliationState: row.reconciliationState, failureReason: row.failureReason,
      scenario: row.scenario, attemptCount: row.attemptCount, attemptTimestamp: row.createdAt.toISOString(),
      lastAttemptAt: row.lastAttemptAt?.toISOString() || null, lastCheckedAt: row.lastCheckedAt?.toISOString() || null,
      canSubmit: row.syncStatus === "queued", canRetry: row.syncStatus === "transmission_failed" && row.reconciliationState === "safe_retry",
      canReconcile: row.syncStatus === "uncertain" && row.reconciliationState === "pending" && Boolean(row.postingReference),
      audits: audits.filter(event => event.entityId === row.id).map(event => ({ id: event.id, action: event.action, actorId: event.actorId, actorName: userMap.get(event.actorId) || event.actorId, actorRole: event.actorRole, timestamp: event.createdAt.toISOString(), before: parse(event.beforeJson), after: parse(event.afterJson) })),
    })),
    limitations: ["All mappings, categories and posting references are DEMO placeholders, not Lakowe Lakes' approved Sage 200 configuration.", "Accounting synchronization status is independent of POS settlement status and never mutates the source transaction.", "Wallet deposits are excluded because discovery uses eligible POS transactions, not wallet ledger credits.", "Uncertain acknowledgments cannot be resubmitted; only deterministic retrieval is exposed."],
  };
}
