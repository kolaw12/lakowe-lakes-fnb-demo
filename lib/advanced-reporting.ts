import { getAuditReport, getOverrideReport } from "@/lib/audit-reporting";
import { getManagementReport } from "@/lib/management-reporting";

export const ADVANCED_REPORT_TYPES = ["sales", "outlets", "employees", "overrides"] as const;
export type AdvancedReportType = typeof ADVANCED_REPORT_TYPES[number];
export type ReportCell = string | number | null;
export type ReportColumn = { key: string; label: string; type: "text" | "number" | "money" | "date" };
type Option = { id: string; label: string; role?: string };
export type AdvancedReportInput = {
  type?: string | null; from?: string | null; to?: string | null; outlet?: string | null;
  employee?: string | null; supervisor?: string | null; transactionStatus?: string | null;
  paymentMethod?: string | null; overrideStatus?: string | null; page?: string | null; pageSize?: string | null;
};
export type AdvancedReportDataset = {
  reportType: AdvancedReportType; title: string; subtitle: string; demo: true; generatedAt: string;
  appliedFilters: Array<{ key: string; label: string; value: string }>;
  filterOptions: { outlets: Option[]; employees: Option[]; supervisors: Option[]; transactionStatuses: Option[]; paymentMethods: Option[]; overrideStatuses: Option[] };
  summary: Array<{ key: string; label: string; value: string | number; type: "text" | "number" | "money" }>;
  columns: ReportColumn[]; rows: Array<Record<string, ReportCell>>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  charts: {
    salesTrend?: Array<{ date: string; sales: number; transactions: number }>;
    paymentBreakdown?: Array<{ id: string; label: string; sales: number; transactions: number }>;
    outletComparison?: Array<{ id: string; label: string; sales: number; transactions: number; orders: number; completedOrders: number }>;
    actionBreakdown?: Array<{ action: string; count: number }>;
  };
  truncated: boolean; exportLimit: number; limitations: string[];
};

export class AdvancedReportInputError extends Error {}
export const MAX_REPORT_EXPORT_ROWS = 2000;

function value(input?: string | null) { return input?.trim() || null; }
function pageValue(input: string | null | undefined, fallback: number, maximum: number, label: string) {
  if (!input) return fallback;
  if (!/^\d+$/.test(input)) throw new AdvancedReportInputError(`${label} must be a positive integer.`);
  const parsed = Number(input);
  if (parsed < 1 || parsed > maximum) throw new AdvancedReportInputError(`${label} must be between 1 and ${maximum}.`);
  return parsed;
}
function reportType(input?: string | null): AdvancedReportType {
  const selected = value(input) || "sales";
  if (!ADVANCED_REPORT_TYPES.includes(selected as AdvancedReportType)) throw new AdvancedReportInputError("Select a valid report type.");
  return selected as AdvancedReportType;
}
function label(options: Option[], id: string | null, fallback: string) { return id ? options.find(option => option.id === id)?.label || id : fallback; }
function commonFilters(from: string | null, to: string | null, outlet: string | null, outlets: Option[]) {
  return [
    { key: "period", label: "Period", value: `${from || "All time"} to ${to || "Present"}` },
    { key: "outlet", label: "Outlet", value: label(outlets, outlet, "All outlets") },
  ];
}
function emptyOptions() {
  return { outlets: [] as Option[], employees: [] as Option[], supervisors: [] as Option[], transactionStatuses: [] as Option[], paymentMethods: [] as Option[], overrideStatuses: [] as Option[] };
}
function rejectIrrelevant(selected: AdvancedReportType, input: AdvancedReportInput) {
  const used: Record<AdvancedReportType, Array<keyof AdvancedReportInput>> = {
    sales: ["type", "from", "to", "outlet", "transactionStatus", "paymentMethod", "page", "pageSize"],
    outlets: ["type", "from", "to", "outlet", "page", "pageSize"],
    employees: ["type", "from", "to", "outlet", "employee", "page", "pageSize"],
    overrides: ["type", "from", "to", "outlet", "employee", "supervisor", "overrideStatus", "page", "pageSize"],
  };
  const allowed = new Set(used[selected]);
  for (const [key, raw] of Object.entries(input)) {
    if (value(raw) && !allowed.has(key as keyof AdvancedReportInput)) throw new AdvancedReportInputError(`${key} is not supported for the ${selected} report.`);
  }
}
async function collectAudit(input: NonNullable<Parameters<typeof getAuditReport>[0]>, exportMode: boolean) {
  const first = await getAuditReport({ ...input, page: "1", pageSize: exportMode ? "100" : input.pageSize });
  if (!exportMode || first.pagination.totalPages === 1) return first;
  const events = [...first.events];
  for (let page = 2; page <= first.pagination.totalPages && events.length < MAX_REPORT_EXPORT_ROWS; page++) {
    const next = await getAuditReport({ ...input, page: String(page), pageSize: "100" });
    events.push(...next.events.slice(0, MAX_REPORT_EXPORT_ROWS - events.length));
  }
  return { ...first, events, pagination: { page: 1, pageSize: events.length || 1, totalItems: first.pagination.totalItems, totalPages: 1 } };
}
async function collectOverrides(input: NonNullable<Parameters<typeof getOverrideReport>[0]>, exportMode: boolean) {
  const first = await getOverrideReport({ ...input, page: "1", pageSize: exportMode ? "100" : input.pageSize });
  if (!exportMode || first.pagination.totalPages === 1) return first;
  const overrides = [...first.overrides];
  for (let page = 2; page <= first.pagination.totalPages && overrides.length < MAX_REPORT_EXPORT_ROWS; page++) {
    const next = await getOverrideReport({ ...input, page: String(page), pageSize: "100" });
    overrides.push(...next.overrides.slice(0, MAX_REPORT_EXPORT_ROWS - overrides.length));
  }
  return { ...first, overrides, pagination: { page: 1, pageSize: overrides.length || 1, totalItems: first.pagination.totalItems, totalPages: 1 } };
}

export async function getAdvancedReport(input: AdvancedReportInput = {}, exportMode = false): Promise<AdvancedReportDataset> {
  const selected = reportType(input.type);
  rejectIrrelevant(selected, input);
  const from = value(input.from), to = value(input.to), outlet = value(input.outlet);
  const page = pageValue(input.page, 1, 100000, "Page");
  const pageSize = pageValue(input.pageSize, 20, 100, "Page size");

  if (selected === "sales") {
    const transactionStatus = value(input.transactionStatus), paymentMethod = value(input.paymentMethod);
    const report = await getManagementReport({ from, to, outlet, transactionStatus, paymentMethod, transactionLimit: exportMode ? MAX_REPORT_EXPORT_ROWS : pageSize, transactionOffset: exportMode ? 0 : (page - 1) * pageSize });
    const options = { ...emptyOptions(), outlets: report.availableOutlets.map(item => ({ id: item.id, label: item.name })), transactionStatuses: report.availableTransactionStatuses.map(id => ({ id, label: id.replaceAll("_", " ") })), paymentMethods: report.availablePaymentMethods };
    return {
      reportType: selected, title: "Sales Report", subtitle: "Eligible POS sales, payment activity, voids, discounts and daily transaction trends.", demo: true, generatedAt: report.generatedAt,
      appliedFilters: [...commonFilters(from, to, outlet, options.outlets), { key: "transactionStatus", label: "Transaction status", value: label(options.transactionStatuses, transactionStatus, "All statuses") }, { key: "paymentMethod", label: "Payment method", value: label(options.paymentMethods, paymentMethod, "All methods") }],
      filterOptions: options,
      summary: [
        { key: "eligibleSales", label: "Eligible sales", value: report.summary.totalEligibleSales, type: "money" },
        { key: "transactions", label: "Eligible transactions", value: report.summary.eligibleTransactions, type: "number" },
        { key: "voids", label: "Voided transactions", value: report.summary.voidedTransactions, type: "number" },
        { key: "discounts", label: "Approved discounts", value: report.summary.approvedDiscountAmount, type: "money" },
      ],
      columns: [
        { key: "createdAt", label: "Timestamp", type: "date" }, { key: "transactionId", label: "Transaction", type: "text" },
        { key: "orderReference", label: "Order", type: "text" }, { key: "outlet", label: "Outlet", type: "text" },
        { key: "payment", label: "Payment method", type: "text" }, { key: "transactionStatus", label: "Transaction status", type: "text" },
        { key: "orderStatus", label: "Order status", type: "text" }, { key: "grossAmount", label: "Gross amount", type: "money" },
        { key: "eligibleAmount", label: "Eligible amount", type: "money" },
      ],
      rows: report.recentTransactions.map(row => ({ createdAt: row.createdAt, transactionId: row.id, orderReference: row.orderReference, outlet: row.outletName, payment: row.paymentLabel, transactionStatus: row.transactionStatus, orderStatus: row.orderStatus, grossAmount: row.grossAmount, eligibleAmount: row.eligibleAmount })),
      pagination: { page: exportMode ? 1 : page, pageSize: exportMode ? Math.min(report.summary.matchingTransactions, MAX_REPORT_EXPORT_ROWS) || 1 : pageSize, totalItems: report.summary.matchingTransactions, totalPages: exportMode ? 1 : Math.max(1, Math.ceil(report.summary.matchingTransactions / pageSize)) },
      charts: { salesTrend: report.salesTrend, paymentBreakdown: report.paymentBreakdown.map(item => ({ id: item.paymentMethod, label: item.label, sales: item.sales, transactions: item.transactions })) },
      truncated: exportMode && report.summary.matchingTransactions > MAX_REPORT_EXPORT_ROWS, exportLimit: MAX_REPORT_EXPORT_ROWS, limitations: report.limitations,
    };
  }

  if (selected === "outlets") {
    const report = await getManagementReport({ from, to, outlet, transactionLimit: 0 });
    const options = { ...emptyOptions(), outlets: report.availableOutlets.map(item => ({ id: item.id, label: item.name })) };
    return {
      reportType: selected, title: "Outlet Performance Report", subtitle: "Comparable outlet sales, order completion and eligible transaction activity.", demo: true, generatedAt: report.generatedAt,
      appliedFilters: commonFilters(from, to, outlet, options.outlets), filterOptions: options,
      summary: [
        { key: "eligibleSales", label: "Eligible sales", value: report.summary.totalEligibleSales, type: "money" },
        { key: "orders", label: "Orders", value: report.summary.totalOrders, type: "number" },
        { key: "completedOrders", label: "Completed orders", value: report.summary.completedOrders, type: "number" },
        { key: "transactions", label: "Eligible transactions", value: report.summary.eligibleTransactions, type: "number" },
      ],
      columns: [
        { key: "outlet", label: "Outlet", type: "text" }, { key: "sales", label: "Eligible sales", type: "money" },
        { key: "orders", label: "Orders", type: "number" }, { key: "completedOrders", label: "Completed orders", type: "number" },
        { key: "transactions", label: "Eligible transactions", type: "number" },
      ],
      rows: report.outletTotals.map(row => ({ outlet: row.outletName, sales: row.sales, orders: row.orders, completedOrders: row.completedOrders, transactions: row.transactions })),
      pagination: { page: 1, pageSize: report.outletTotals.length || 1, totalItems: report.outletTotals.length, totalPages: 1 },
      charts: { outletComparison: report.outletTotals.map(row => ({ id: row.outletId, label: row.outletName, sales: row.sales, transactions: row.transactions, orders: row.orders, completedOrders: row.completedOrders })) },
      truncated: false, exportLimit: MAX_REPORT_EXPORT_ROWS, limitations: report.limitations,
    };
  }

  if (selected === "employees") {
    const employee = value(input.employee);
    const report = await collectAudit({ from, to, outlet, employee, page: String(page), pageSize: String(pageSize) }, exportMode);
    const options = { ...emptyOptions(), outlets: report.options.outlets, employees: report.options.employees };
    return {
      reportType: selected, title: "Employee Activity Report", subtitle: "Recorded staff and system actions with linked orders, transactions and outlets.", demo: true, generatedAt: report.generatedAt,
      appliedFilters: [...commonFilters(from, to, outlet, options.outlets), { key: "employee", label: "Employee", value: label(options.employees, employee, "All recorded actors") }], filterOptions: options,
      summary: [
        { key: "actions", label: "Recorded actions", value: report.summary.total, type: "number" },
        { key: "statusChanges", label: "Order status changes", value: report.summary.orderStatusChanges, type: "number" },
        { key: "overrideRequests", label: "Override requests", value: report.summary.overrideRequests, type: "number" },
        { key: "actors", label: "Actors in filter options", value: report.options.employees.length, type: "number" },
      ],
      columns: [
        { key: "timestamp", label: "Timestamp", type: "date" }, { key: "employee", label: "Employee", type: "text" },
        { key: "role", label: "Role", type: "text" }, { key: "action", label: "Action", type: "text" },
        { key: "outlet", label: "Outlet", type: "text" }, { key: "orderReference", label: "Order", type: "text" },
        { key: "transactionId", label: "Transaction", type: "text" }, { key: "entity", label: "Affected entity", type: "text" },
      ],
      rows: report.events.map(event => ({ timestamp: event.timestamp, employee: event.actorName, role: event.actorRole, action: event.action, outlet: event.outletName, orderReference: event.orderReference, transactionId: event.transactionId, entity: `${event.entityType}: ${event.entityId}` })),
      pagination: report.pagination, charts: { actionBreakdown: report.summary.actionCounts },
      truncated: exportMode && report.pagination.totalItems > MAX_REPORT_EXPORT_ROWS, exportLimit: MAX_REPORT_EXPORT_ROWS, limitations: report.limitations,
    };
  }

  const employee = value(input.employee), supervisor = value(input.supervisor), overrideStatus = value(input.overrideStatus);
  const report = await collectOverrides({ from, to, outlet, employee, supervisor, status: overrideStatus, page: String(page), pageSize: String(pageSize) }, exportMode);
  const options = { ...emptyOptions(), outlets: report.options.outlets, employees: report.options.employees, supervisors: report.options.supervisors, overrideStatuses: report.options.statuses.map(id => ({ id, label: id })) };
  return {
    reportType: selected, title: "Supervisor Override Report", subtitle: "Override requests, supervisor decisions, reasons, related transactions and timestamps.", demo: true, generatedAt: report.generatedAt,
    appliedFilters: [...commonFilters(from, to, outlet, options.outlets), { key: "employee", label: "Requesting employee", value: label(options.employees, employee, "All requesters") }, { key: "supervisor", label: "Deciding supervisor", value: label(options.supervisors, supervisor, "All supervisors") }, { key: "overrideStatus", label: "Decision status", value: label(options.overrideStatuses, overrideStatus, "All statuses") }],
    filterOptions: options,
    summary: [
      { key: "requests", label: "Requests", value: report.summary.total, type: "number" },
      { key: "pending", label: "Pending", value: report.summary.pending, type: "number" },
      { key: "approved", label: "Approved", value: report.summary.approved, type: "number" },
      { key: "rejected", label: "Rejected", value: report.summary.rejected, type: "number" },
    ],
    columns: [
      { key: "requestedAt", label: "Requested at", type: "date" }, { key: "requestId", label: "Request", type: "text" },
      { key: "transactionId", label: "Transaction", type: "text" }, { key: "orderReference", label: "Order", type: "text" },
      { key: "outlet", label: "Outlet", type: "text" }, { key: "requester", label: "Requesting employee", type: "text" },
      { key: "supervisor", label: "Deciding supervisor", type: "text" }, { key: "action", label: "Requested action", type: "text" },
      { key: "originalAmount", label: "Original amount", type: "money" }, { key: "proposedAmount", label: "Proposed adjustment", type: "money" },
      { key: "requestReason", label: "Request reason", type: "text" }, { key: "status", label: "Decision status", type: "text" },
      { key: "decisionReason", label: "Decision reason", type: "text" }, { key: "decidedAt", label: "Decision timestamp", type: "date" },
    ],
    rows: report.overrides.map(item => ({ requestedAt: item.requestedAt, requestId: item.id, transactionId: item.transactionId, orderReference: item.orderReference, outlet: item.outletName, requester: `${item.requesterName} (${item.requesterRole})`, supervisor: item.decidingSupervisorName, action: item.requestedAction, originalAmount: item.originalAmount, proposedAmount: item.proposedAmount, requestReason: item.requestReason, status: item.status, decisionReason: item.decisionReason, decidedAt: item.decidedAt })),
    pagination: report.pagination, charts: {}, truncated: exportMode && report.pagination.totalItems > MAX_REPORT_EXPORT_ROWS, exportLimit: MAX_REPORT_EXPORT_ROWS, limitations: report.limitations,
  };
}
