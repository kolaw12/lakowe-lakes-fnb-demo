import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getItem } from "@/lib/fnb";

type Db = Pick<PrismaClient, "outlet" | "operaRoomChargeAttempt" | "sageAccountingSync" | "overrideRequest" | "refundRequest" | "menuAvailability">;
export type ExceptionInput = { from?: string | null; to?: string | null; category?: string | null; severity?: string | null; outlet?: string | null; page?: string | null; pageSize?: string | null };
export class ExceptionMonitoringInputError extends Error {}
export type ManagementException = { id: string; category: string; categoryLabel: string; severity: "high" | "medium" | "info"; outletId: string | null; outletName: string | null; reference: string; status: string; detectedAt: string; explanation: string; nextStep: string; href: string };

const categories = [
  ["opera_uncertain", "Uncertain OPERA posting"], ["opera_unresolved", "Unresolved OPERA posting"], ["opera_rejected", "Rejected OPERA posting"],
  ["sage_failed", "Failed or uncertain Sage synchronization"], ["sage_refund_reversal", "Sage refund reversal required"],
  ["pending_override", "Pending supervisor override"], ["pending_wallet_refund", "Pending wallet refund approval"], ["menu_unavailable", "Unavailable menu item"],
] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const severityRank = { high: 0, medium: 1, info: 2 } as const;
const label = new Map(categories);
function text(v?: string | null) { return v?.trim() || null; }
function validDate(v: string) { return datePattern.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v; }
function pageValue(raw: string | null | undefined, fallback: number, max: number, name: string) { if (!raw) return fallback; if (!/^\d+$/.test(raw)) throw new ExceptionMonitoringInputError(`${name} must be a positive integer.`); const n = Number(raw); if (n < 1 || n > max) throw new ExceptionMonitoringInputError(`${name} must be between 1 and ${max}.`); return n; }
function item(id: string, category: string, severity: ManagementException["severity"], outletId: string | null, outletName: string | null, reference: string, status: string, date: Date, explanation: string, nextStep: string, href: string): ManagementException { return { id, category, categoryLabel: label.get(category as typeof categories[number][0]) || category, severity, outletId, outletName, reference, status, detectedAt: date.toISOString(), explanation, nextStep, href }; }

export async function getExceptionMonitoringReport(input: ExceptionInput = {}, db: Db = prisma) {
  const filters = { from: text(input.from), to: text(input.to), category: text(input.category), severity: text(input.severity), outlet: text(input.outlet) };
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) throw new ExceptionMonitoringInputError("Dates must use a valid YYYY-MM-DD calendar date.");
  if (filters.from && filters.to && filters.from > filters.to) throw new ExceptionMonitoringInputError("End date cannot be before start date.");
  if (filters.category && !label.has(filters.category as typeof categories[number][0])) throw new ExceptionMonitoringInputError("Select a valid exception category.");
  if (filters.severity && !["high", "medium", "info"].includes(filters.severity)) throw new ExceptionMonitoringInputError("Select a valid severity.");
  const page = pageValue(input.page, 1, 100000, "Page"), pageSize = pageValue(input.pageSize, 10, 100, "Page size");
  const [outlets, opera, sage, overrides, refunds, availability] = await Promise.all([
    db.outlet.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }), db.operaRoomChargeAttempt.findMany(), db.sageAccountingSync.findMany(),
    db.overrideRequest.findMany({ where: { status: "pending" }, include: { transaction: { include: { order: true } } } }),
    db.refundRequest.findMany({ where: { status: "pending" }, include: { transaction: { include: { order: true } } } }), db.menuAvailability.findMany({ where: { available: false } }),
  ]);
  if (filters.outlet && !outlets.some(o => o.id === filters.outlet)) throw new ExceptionMonitoringInputError("Select a valid outlet.");
  const outletNames = new Map(outlets.map(o => [o.id, o.name]));
  const rows: ManagementException[] = [];
  for (const row of opera) {
    const name = outletNames.get(row.outletId) || row.outletId;
    if (row.postingStatus === "uncertain" && row.reconciliationState === "pending") rows.push(item(`opera:${row.id}`, "opera_uncertain", "high", row.outletId, name, row.orderReference, "pending reconciliation", row.updatedAt, "An OPERA posting acknowledgement is uncertain and has not been reconciled.", "Open OPERA monitoring and retrieve the recorded posting result.", "/management/opera"));
    else if (row.postingStatus === "unavailable" || row.reconciliationState === "manual_review") rows.push(item(`opera:${row.id}`, "opera_unresolved", "medium", row.outletId, name, row.orderReference, row.postingStatus, row.updatedAt, "The OPERA simulation could not complete safely and requires manual review.", "Review the OPERA attempt and follow the documented manual-review process.", "/management/opera"));
    else if (row.postingStatus === "rejected") rows.push(item(`opera:${row.id}`, "opera_rejected", "info", row.outletId, name, row.orderReference, "rejected (closed)", row.updatedAt, "The OPERA posting was rejected; no POS transaction was created.", "Review for operational learning only; no automatic retry is available.", "/management/opera"));
  }
  for (const row of sage) {
    const name = outletNames.get(row.outletId) || row.outletId;
    if (row.reconciliationState === "refund_reversal_required") rows.push(item(`sage:${row.id}`, "sage_refund_reversal", "high", row.outletId, name, row.reversalReference || row.sourceOrderReference, row.reconciliationState, row.updatedAt, "An approved wallet refund requires a corresponding accounting reversal review.", "Open Sage monitoring and complete the documented reversal reconciliation.", "/management/sage"));
    else if (["uncertain", "transmission_failed"].includes(row.syncStatus) || ["pending", "manual_review"].includes(row.reconciliationState)) rows.push(item(`sage:${row.id}`, "sage_failed", row.syncStatus === "uncertain" ? "high" : "medium", row.outletId, name, row.sourceOrderReference, row.syncStatus, row.updatedAt, "The Sage simulation did not reach a confirmed posted state.", "Open Sage monitoring and use only its documented safe retry or reconciliation controls.", "/management/sage"));
  }
  for (const row of overrides) rows.push(item(`override:${row.id}`, "pending_override", "medium", row.transaction.outletId, outletNames.get(row.transaction.outletId) || row.transaction.outletId, row.id, "pending supervisor decision", row.createdAt, "A controlled transaction adjustment is waiting for supervisor review.", "Open Supervisor Overrides to approve or reject with a recorded reason.", `/management/overrides?reference=${encodeURIComponent(row.id)}`));
  for (const row of refunds) rows.push(item(`refund:${row.id}`, "pending_wallet_refund", "medium", row.transaction.outletId, outletNames.get(row.transaction.outletId) || row.transaction.outletId, row.id, "pending supervisor decision", row.createdAt, "A golfer-wallet refund request is awaiting a supervisor decision.", "Open the staff approval inbox and record a decision.", "/staff/approvals"));
  for (const row of availability) { const menu = getItem(row.itemId); rows.push(item(`menu:${row.outletId}:${row.itemId}`, "menu_unavailable", "info", row.outletId, outletNames.get(row.outletId) || row.outletId, menu?.name || row.itemId, "unavailable", row.updatedAt, "This menu item is currently marked unavailable to guests.", "Review availability with the outlet team when stock or preparation changes.", "/staff/menu")); }
  const filtered = rows.filter(row => (!filters.category || row.category === filters.category) && (!filters.severity || row.severity === filters.severity) && (!filters.outlet || row.outletId === filters.outlet) && (!filters.from || row.detectedAt >= `${filters.from}T00:00:00.000Z`) && (!filters.to || row.detectedAt <= `${filters.to}T23:59:59.999Z`)).sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.detectedAt.localeCompare(a.detectedAt) || a.id.localeCompare(b.id));
  return { generatedAt: new Date().toISOString(), filters, options: { categories: categories.map(([id, label]) => ({ id, label })), severities: ["high", "medium", "info"], outlets }, summary: { total: filtered.length, high: filtered.filter(r => r.severity === "high").length, medium: filtered.filter(r => r.severity === "medium").length, info: filtered.filter(r => r.severity === "info").length }, pagination: { page, pageSize, totalItems: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) }, exceptions: filtered.slice((page - 1) * pageSize, page * pageSize), severityRules: ["High: an uncertain financial/integration state or a refund accounting reversal that requires reconciliation.", "Medium: an unresolved integration issue or a pending supervisor financial-control decision.", "Informational: a closed OPERA rejection or an intentionally unavailable menu item."], limitations: ["This dashboard reports persisted states only; it creates no audit events, retries, financial entries or corrections.", "Kitchen-delay exceptions are excluded because the current data has no documented delay threshold.", "OPERA and Sage values are demo simulation records; masked or sensitive source fields are not exposed."] };
}
