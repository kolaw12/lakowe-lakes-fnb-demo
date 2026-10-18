import { NextRequest, NextResponse } from "next/server";
import { AdvancedReportInputError, getAdvancedReport } from "@/lib/advanced-reporting";
import { AuditReportInputError } from "@/lib/audit-reporting";
import { ManagementAccessError, requireManagementAccess } from "@/lib/management-access";
import { ManagementReportInputError } from "@/lib/management-reporting";
import { createReportCsv, createReportPdf, reportFilename } from "@/lib/report-exports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const allowed = new Set(["type", "from", "to", "outlet", "employee", "supervisor", "transactionStatus", "paymentMethod", "overrideStatus", "page", "pageSize", "format"]);

export async function GET(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const query = request.nextUrl.searchParams;
    for (const key of Array.from(query.keys())) {
      if (!allowed.has(key)) throw new AdvancedReportInputError(`Unsupported report parameter: ${key}.`);
      if (query.getAll(key).length > 1) throw new AdvancedReportInputError(`Report parameter ${key} may only be supplied once.`);
    }
    const format = query.get("format") || "json";
    if (!["json", "csv", "pdf"].includes(format)) throw new AdvancedReportInputError("Format must be json, csv or pdf.");
    const report = await getAdvancedReport({
      type: query.get("type"), from: query.get("from"), to: query.get("to"), outlet: query.get("outlet"),
      employee: query.get("employee"), supervisor: query.get("supervisor"),
      transactionStatus: query.get("transactionStatus"), paymentMethod: query.get("paymentMethod"),
      overrideStatus: query.get("overrideStatus"), page: query.get("page"), pageSize: query.get("pageSize"),
    }, format !== "json");
    if (format === "csv") {
      return new NextResponse(createReportCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=${reportFilename(report, "csv")}`, "cache-control": "no-store" } });
    }
    if (format === "pdf") {
      const pdf = await createReportPdf(report);
      return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename=${reportFilename(report, "pdf")}`, "cache-control": "no-store" } });
    }
    return NextResponse.json({ access: { id: user.id, name: user.name, role: user.role, mode: "demo" }, report }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdvancedReportInputError || error instanceof AuditReportInputError || error instanceof ManagementReportInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Advanced management report failed", error);
    return NextResponse.json({ error: "Advanced management reporting is unavailable." }, { status: 500 });
  }
}
