import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MANAGEMENT_KPI_DEFINITIONS = {
  totalEligibleSales: "Sum of each eligible POS transaction once. Settled transactions use their recorded amount; approved discounts subtract the recorded discount amount; voided transactions and wallet deposits are excluded.",
  totalOrders: "Orders created in the selected period and outlet, regardless of payment or service status.",
  completedOrders: "Orders whose service status is completed. This does not imply payment unless the linked transaction is eligible.",
  voidedTransactions: "POS transactions whose payment status is voided in the selected period and outlet.",
} as const;

export type ManagementFilters = { from: string | null; to: string | null; outlet: string | null; paymentMethod: string | null; transactionStatus: string | null };
export type ManagementReport = {
  generatedAt: string;
  filters: ManagementFilters;
  availableOutlets: Array<{ id: string; name: string }>;
  availablePaymentMethods: Array<{ id: string; label: string }>;
  availableTransactionStatuses: string[];
  summary: { totalEligibleSales: number; totalGrossSales: number; approvedDiscountAmount: number; eligibleTransactions: number; matchingTransactions: number; discountedTransactions: number; totalOrders: number; completedOrders: number; voidedTransactions: number; excludedAdjustedTransactions: number };
  outletTotals: Array<{ outletId: string; outletName: string; sales: number; transactions: number; orders: number; completedOrders: number }>;
  paymentBreakdown: Array<{ paymentMethod: string; label: string; sales: number; transactions: number }>;
  salesTrend: Array<{ date: string; sales: number; transactions: number }>;
  recentTransactions: Array<{ id: string; orderReference: string; outletId: string; outletName: string; paymentMethod: string; paymentLabel: string; transactionStatus: string; orderStatus: string; grossAmount: number; eligibleAmount: number | null; createdAt: string }>;
  definitions: typeof MANAGEMENT_KPI_DEFINITIONS;
  limitations: string[];
};

type ReportingDb = Pick<PrismaClient, "outlet" | "order" | "transaction">;
export type ManagementReportInput = { from?: string | null; to?: string | null; outlet?: string | null; paymentMethod?: string | null; transactionStatus?: string | null; transactionLimit?: number; transactionOffset?: number };
export class ManagementReportInputError extends Error {}
const ELIGIBLE_STATUSES = new Set(["settled", "discounted"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string) {
  return datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function paymentLabel(method: string) {
  if (method === "wallet_demo") return "Golfer Wallet";
  if (method === "demo") return "Demo checkout";
  return method.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function managementEligibleAmount(transaction: { amount: number; status: string; adjustmentJson: string | null }) {
  if (!ELIGIBLE_STATUSES.has(transaction.status) || transaction.amount < 0) return null;
  if (transaction.status === "settled") return transaction.amount;
  try {
    const adjustment: unknown = transaction.adjustmentJson ? JSON.parse(transaction.adjustmentJson) : null;
    if (!adjustment || typeof adjustment !== "object" || !("type" in adjustment) || !("amount" in adjustment)) return null;
    if (adjustment.type !== "discount" || !Number.isInteger(adjustment.amount) || Number(adjustment.amount) < 0 || Number(adjustment.amount) > transaction.amount) return null;
    return transaction.amount - Number(adjustment.amount);
  } catch {
    return null;
  }
}

export async function getManagementReport(input: ManagementReportInput = {}, db: ReportingDb = prisma): Promise<ManagementReport> {
  const filters: ManagementFilters = { from: input.from?.trim() || null, to: input.to?.trim() || null, outlet: input.outlet?.trim() || null, paymentMethod: input.paymentMethod?.trim() || null, transactionStatus: input.transactionStatus?.trim() || null };
  const transactionLimit = input.transactionLimit ?? 12;
  const transactionOffset = input.transactionOffset ?? 0;
  if (!Number.isInteger(transactionLimit) || transactionLimit < 0 || transactionLimit > 2000) throw new ManagementReportInputError("Transaction limit must be between 0 and 2000.");
  if (!Number.isInteger(transactionOffset) || transactionOffset < 0) throw new ManagementReportInputError("Transaction offset must be zero or greater.");
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) throw new ManagementReportInputError("Dates must use a valid YYYY-MM-DD calendar date.");
  if (filters.from && filters.to && filters.from > filters.to) throw new ManagementReportInputError("End date cannot be before start date.");
  if (filters.from && filters.to) {
    const span = Date.parse(`${filters.to}T00:00:00.000Z`) - Date.parse(`${filters.from}T00:00:00.000Z`);
    if (span > 366 * 24 * 60 * 60 * 1000) throw new ManagementReportInputError("Date range cannot exceed 366 days.");
  }
  const [outlets, paymentRows, statusRows] = await Promise.all([
    db.outlet.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.transaction.findMany({ distinct: ["paymentType"], select: { paymentType: true } }),
    db.transaction.findMany({ distinct: ["status"], select: { status: true } }),
  ]);
  const availablePaymentMethods = paymentRows.map(row => ({ id: row.paymentType, label: paymentLabel(row.paymentType) })).sort((a, b) => a.label.localeCompare(b.label));
  const availableTransactionStatuses = statusRows.map(row => row.status).sort();
  if (filters.outlet && !outlets.some(outlet => outlet.id === filters.outlet)) throw new ManagementReportInputError("Select a valid outlet.");
  if (filters.paymentMethod && !availablePaymentMethods.some(method => method.id === filters.paymentMethod)) throw new ManagementReportInputError("Select a valid payment method.");
  if (filters.transactionStatus && !availableTransactionStatuses.includes(filters.transactionStatus)) throw new ManagementReportInputError("Select a valid transaction status.");
  const dateRange = filters.from || filters.to ? { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) } : undefined;
  const outletWhere = filters.outlet ? { outletId: filters.outlet } : {};
  const [orders, transactions] = await Promise.all([
    db.order.findMany({ where: { ...outletWhere, ...(dateRange ? { createdAt: dateRange } : {}) }, select: { status: true, outletId: true } }),
    db.transaction.findMany({ where: { ...outletWhere, ...(dateRange ? { createdAt: dateRange } : {}), ...(filters.paymentMethod ? { paymentType: filters.paymentMethod } : {}), ...(filters.transactionStatus ? { status: filters.transactionStatus } : {}) }, include: { outlet: { select: { id: true, name: true } }, order: { select: { reference: true, status: true, paymentMethod: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const included = transactions.flatMap(transaction => { const amount = managementEligibleAmount(transaction); return amount !== null ? [{ transaction, amount, discount: transaction.amount - amount }] : []; });
  const totalEligibleSales = included.reduce((total, item) => total + item.amount, 0);
  const outletTotals = outlets.filter(outlet => !filters.outlet || outlet.id === filters.outlet).map(outlet => {
    const rows = included.filter(item => item.transaction.outletId === outlet.id);
    const outletOrders = orders.filter(order => order.outletId === outlet.id);
    return { outletId: outlet.id, outletName: outlet.name, sales: rows.reduce((total, item) => total + item.amount, 0), transactions: rows.length, orders: outletOrders.length, completedOrders: outletOrders.filter(order => order.status === "completed").length };
  }).sort((a, b) => b.sales - a.sales || a.outletName.localeCompare(b.outletName));
  const payments = new Map<string, { sales: number; transactions: number }>();
  const trend = new Map<string, { sales: number; transactions: number }>();
  for (const item of included) {
    const payment = item.transaction.paymentType;
    const currentPayment = payments.get(payment) || { sales: 0, transactions: 0 };
    payments.set(payment, { sales: currentPayment.sales + item.amount, transactions: currentPayment.transactions + 1 });
    const date = item.transaction.createdAt.toISOString().slice(0, 10);
    const currentDay = trend.get(date) || { sales: 0, transactions: 0 };
    trend.set(date, { sales: currentDay.sales + item.amount, transactions: currentDay.transactions + 1 });
  }
  return {
    generatedAt: new Date().toISOString(), filters, availableOutlets: outlets, availablePaymentMethods, availableTransactionStatuses,
    summary: { totalEligibleSales, totalGrossSales: included.reduce((total, item) => total + item.transaction.amount, 0), approvedDiscountAmount: included.reduce((total, item) => total + item.discount, 0), eligibleTransactions: included.length, matchingTransactions: transactions.length, discountedTransactions: included.filter(item => item.transaction.status === "discounted").length, totalOrders: orders.length, completedOrders: orders.filter(order => order.status === "completed").length, voidedTransactions: transactions.filter(transaction => transaction.status === "voided").length, excludedAdjustedTransactions: transactions.filter(transaction => transaction.status === "discounted" && managementEligibleAmount(transaction) === null).length },
    outletTotals,
    paymentBreakdown: Array.from(payments.entries()).map(([paymentMethod, values]) => ({ paymentMethod, label: paymentLabel(paymentMethod), ...values })).sort((a, b) => b.sales - a.sales),
    salesTrend: Array.from(trend.entries()).map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date)),
    recentTransactions: transactions.slice(transactionOffset, transactionOffset + transactionLimit).map(transaction => ({ id: transaction.id, orderReference: transaction.order.reference, outletId: transaction.outlet.id, outletName: transaction.outlet.name, paymentMethod: transaction.paymentType, paymentLabel: paymentLabel(transaction.paymentType), transactionStatus: transaction.status, orderStatus: transaction.order.status, grossAmount: transaction.amount, eligibleAmount: transaction.status === "voided" ? 0 : managementEligibleAmount(transaction), createdAt: transaction.createdAt.toISOString() })),
    definitions: MANAGEMENT_KPI_DEFINITIONS,
    limitations: ["Profit, costs, expenses, taxes, inventory, covers and payment-provider settlement are not recorded, so they are not reported.", "Order completion is a service status and is reported separately from payment status.", "Demo identity headers are server-authorized against persisted roles, but this local demo is not production authentication."],
  };
}
